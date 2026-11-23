// Run with `npm test` (node --test, Node's own type stripping; no test framework).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CRATE_MAX_ROWS,
  DEFAULT_CRATE_VIEW,
  addToCrate,
  crateRowBucket,
  crateToCsv,
  crateToText,
  filterByRange,
  hasRange,
  matchInRange,
  parseCrate,
  parseCrateView,
  removeFromCrate,
  rowKey,
  serializeCrate,
  serializeCrateView,
  sortCrate,
  toBound,
  type CrateRow,
} from '../.vitepress/tools/bpm-crate.ts'

const row = (name: string, bpm: number, addedAt = 1, sizeBytes = 1000): CrateRow => ({ name, sizeBytes, bpm, durationS: 200, addedAt })

test('parseCrate reads what serializeCrate wrote', () => {
  const rows = [row('a.mp3', 124), row('b.mp3', 96)]
  assert.deepEqual(parseCrate(serializeCrate(rows)), rows)
})

test('parseCrate drops anything storage could hold that is not a row', () => {
  assert.deepEqual(parseCrate(null), [])
  assert.deepEqual(parseCrate('not json'), [])
  assert.deepEqual(parseCrate('{"name":"a"}'), [])
  const raw = JSON.stringify([
    row('ok.mp3', 120),
    { name: 'x', bpm: 'fast' },
    row('', 120),
    row('big.mp3', 9000),
    { ...row('nosize.mp3', 120), sizeBytes: undefined },
    { ...row('frac.mp3', 120), sizeBytes: 1.5 },
    null,
  ])
  assert.deepEqual(parseCrate(raw), [row('ok.mp3', 120)])
})

test('parseCrate keeps only the fields of a row, and one row per file', () => {
  const raw = JSON.stringify([{ ...row('a.mp3', 120), html: '<img>' }, row('a.mp3', 121)])
  assert.deepEqual(parseCrate(raw), [row('a.mp3', 120)])
})

test('addToCrate puts the newest first and replaces the same file', () => {
  const rows = addToCrate(addToCrate([], row('a.mp3', 120, 1)), row('b.mp3', 90, 2))
  assert.deepEqual(rows.map(r => r.name), ['b.mp3', 'a.mp3'])
  const again = addToCrate(rows, row('a.mp3', 121, 3))
  assert.deepEqual(again.map(r => [r.name, r.bpm]), [['a.mp3', 121], ['b.mp3', 90]])
})

test('two different files with the same name both stay', () => {
  const rows = addToCrate([row('track01.mp3', 120, 1, 1000)], row('track01.mp3', 90, 2, 2000))
  assert.equal(rows.length, 2)
  assert.deepEqual(removeFromCrate(rows, rowKey(row('track01.mp3', 0, 0, 2000))).map(r => r.bpm), [120])
})

test('addToCrate caps the list and ignores an invalid entry', () => {
  let rows: CrateRow[] = []
  for (let i = 0; i < CRATE_MAX_ROWS + 5; i++) rows = addToCrate(rows, row(`t${i}.mp3`, 120, i))
  assert.equal(rows.length, CRATE_MAX_ROWS)
  assert.equal(rows[0]?.name, `t${CRATE_MAX_ROWS + 4}.mp3`)
  assert.equal(addToCrate(rows, row('nan.mp3', Number.NaN)).length, CRATE_MAX_ROWS)
  assert.equal(parseCrate(serializeCrate(rows)).length, CRATE_MAX_ROWS)
})

test('sortCrate sorts by tempo, name or recency without touching the input', () => {
  const rows = [row('b.mp3', 128, 2), row('a.mp3', 90, 3), row('c.mp3', 174, 1)]
  assert.deepEqual(sortCrate(rows, 'bpm').map(r => r.bpm), [90, 128, 174])
  assert.deepEqual(sortCrate(rows, 'name').map(r => r.name), ['a.mp3', 'b.mp3', 'c.mp3'])
  assert.deepEqual(sortCrate(rows, 'recent').map(r => r.addedAt), [3, 2, 1])
  assert.deepEqual(rows.map(r => r.name), ['b.mp3', 'a.mp3', 'c.mp3'])
})

test('a range keeps half and double tempos, and says which one matched', () => {
  const rows = [row('run.mp3', 170), row('half.mp3', 85), row('slow.mp3', 120)]
  assert.deepEqual(filterByRange(rows, 160, 180).map(r => r.name), ['run.mp3', 'half.mp3'])
  assert.equal(matchInRange(170, 160, 180), 170)
  assert.equal(matchInRange(85, 160, 180), 170)
  assert.equal(matchInRange(340, 160, 180), 170)
  assert.equal(matchInRange(120, 160, 180), null)
})

test('a missing bound is no limit, and swapped bounds are read as meant', () => {
  const rows = [row('lofi.mp3', 96), row('house.mp3', 124), row('dnb.mp3', 174)]
  assert.equal(hasRange({ low: null, high: null }), false)
  assert.equal(hasRange({ low: 120, high: null }), true)
  // One bound reads the track's own tempo only: with octaves, "from 150" would keep 96 (as 192) too.
  assert.deepEqual(filterByRange(rows, 150, null).map(r => r.name), ['dnb.mp3'])
  assert.deepEqual(filterByRange(rows, null, 100).map(r => r.name), ['lofi.mp3'])
  assert.deepEqual(filterByRange(rows, 180, 170).map(r => r.name), ['dnb.mp3'])
})

test('toBound reads a number field: empty, NaN or off the tempo scale is no bound', () => {
  assert.equal(toBound(''), null)
  assert.equal(toBound('  '), null)
  assert.equal(toBound('abc'), null)
  assert.equal(toBound(Number.NaN), null)
  assert.equal(toBound('5'), null)
  assert.equal(toBound('9000'), null)
  assert.equal(toBound('172'), 172)
  assert.equal(toBound(85), 85)
})

test('the remembered view keeps each valid field and drops the rest', () => {
  const view = { sort: 'bpm' as const, low: 160, high: 180 }
  assert.deepEqual(parseCrateView(serializeCrateView(view)), view)
  assert.deepEqual(parseCrateView(null), DEFAULT_CRATE_VIEW)
  assert.deepEqual(parseCrateView('nope'), DEFAULT_CRATE_VIEW)
  assert.deepEqual(parseCrateView('{"sort":"evil","low":"x","high":170}'), { sort: 'recent', low: null, high: 170 })
})

test('the list size goes to analytics in buckets only', () => {
  assert.deepEqual([1, 2, 5, 6, 20, 21, 100, 101, 500].map(crateRowBucket), ['1', '2-5', '2-5', '6-20', '6-20', '21-100', '21-100', '101+', '101+'])
})

test('crateToCsv quotes, and defuses names a spreadsheet would run as formulas', () => {
  const csv = crateToCsv([row('Artist, "Live".mp3', 124), row('=HYPERLINK("x").mp3', 90)])
  assert.equal(csv, 'File,BPM,Duration (s)\r\n"Artist, ""Live"".mp3",124,200\r\n"\'=HYPERLINK(""x"").mp3",90,200\r\n')
})

test('crateToText is one tab-separated line per track, whatever the name holds', () => {
  assert.equal(crateToText([row('a.mp3', 124), row('b\tc.mp3', 90)]), 'a.mp3\t124\nb c.mp3\t90')
})
