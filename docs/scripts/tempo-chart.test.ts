// Run with `npm test`. The tempo chart's rules (RBA-209): every range names a source the page
// lists, every row plays a tempo the metronome takes and most of its sources share, the rows run
// slow to fast, the clicks reach the catalogue, and the page is linked from the tools it serves
// but not from the home, whose text is frozen.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EVENTS, PARAMS } from '../.vitepress/tools/analytics-events.ts'
import { gateEvent } from '../.vitepress/tools/analytics-gate.ts'
import {
  CHART_ROW_IDS, CHART_TOOLS, GENRE_TEMPOS, ITALIAN_TERMS, SOURCES, chartLink, formatRange, inRange, type ChartRow,
} from '../.vitepress/tools/tempo-chart.ts'
import { MAX_BPM, MIN_BPM, parseBpmParam } from '../.vitepress/tools/tempo.ts'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const rows: readonly ChartRow[] = [...ITALIAN_TERMS, ...GENRE_TEMPOS]

test('every range names a source the page lists, with a bound and in order', () => {
  for (const row of rows) {
    assert.ok(row.ranges.length > 0, `${row.id}: no source`)
    for (const range of row.ranges) {
      assert.ok(Object.hasOwn(SOURCES, range.source), `${row.id}: unknown source ${range.source}`)
      assert.ok(range.min !== undefined || range.max !== undefined, `${row.id}: ${range.source} has no bound`)
      if (range.min !== undefined && range.max !== undefined) assert.ok(range.min <= range.max, `${row.id}: ${range.source}`)
    }
    assert.equal(new Set(row.ranges.map((range) => range.source)).size, row.ranges.length, `${row.id}: a source twice`)
  }
  for (const source of Object.values(SOURCES)) assert.match(source.url, /^https:\/\//, source.title)
})

test('every source in the list is cited by at least one row', () => {
  const cited = new Set(rows.flatMap((row) => row.ranges.map((range) => range.source)))
  for (const id of Object.keys(SOURCES)) assert.ok(cited.has(id as never), `${id} is listed but no row cites it`)
})

// The rule the page states: "a tempo inside the ranges most of the sources share".
test('each row plays a tempo the metronome takes, inside at least half its sources\' ranges', () => {
  for (const row of rows) {
    for (const bpm of [row.play, ...(row.half ? [row.half] : [])]) {
      assert.ok(Number.isInteger(bpm) && bpm >= MIN_BPM && bpm <= MAX_BPM, `${row.id}: ${bpm}`)
      assert.equal(parseBpmParam(String(bpm)), bpm, `${row.id}: the tools would change ${bpm}`)
    }
    const holding = row.ranges.filter((range) => inRange(range, row.play)).length
    assert.ok(holding * 2 >= row.ranges.length, `${row.id}: ${row.play} is inside ${holding} of ${row.ranges.length} ranges`)
    if (row.half) assert.equal(row.half * 2, row.play, `${row.id}: half time is half the tempo`)
  }
})

test('each table runs from slowest to fastest, with unique row ids', () => {
  for (const table of [ITALIAN_TERMS, GENRE_TEMPOS]) {
    table.forEach((row, index) => {
      const before = table[index - 1]
      if (before) assert.ok(before.play <= row.play, `${before.id} (${before.play}) before ${row.id} (${row.play})`)
    })
  }
  assert.equal(new Set(CHART_ROW_IDS).size, CHART_ROW_IDS.length)
  for (const id of CHART_ROW_IDS) assert.match(id, /^[a-z][a-z-]*$/, id)
})

test('the Italian terms run from grave to prestissimo', () => {
  const ids = ITALIAN_TERMS.map((row) => row.id)
  for (const id of ['grave', 'largo', 'adagio', 'andante', 'moderato', 'allegro', 'presto', 'prestissimo']) {
    assert.ok(ids.includes(id), id)
  }
})

test('ranges read as a musician writes them', () => {
  assert.equal(formatRange({ source: 'wikipedia', min: 40, max: 66 }), '40–66')
  assert.equal(formatRange({ source: 'wikipedia', max: 24 }), '24 and under')
  assert.equal(formatRange({ source: 'wikipedia', min: 200 }), '200 and over')
  assert.equal(formatRange({ source: 'izotope', min: 140, max: 140 }), '140')
  assert.ok(inRange({ source: 'wikipedia', max: 24 }, MIN_BPM))
  assert.ok(!inRange({ source: 'wikipedia', min: 40, max: 66 }, 67))
})

test('a row opens the metronome and BPM to ms at its tempo', () => {
  assert.deepEqual(CHART_TOOLS.map((link) => link.label), ['Play', 'Delay times'])
  assert.equal(chartLink('metronome', 126), '/metronome?bpm=126')
  assert.equal(chartLink('bpm-to-ms', 174), '/bpm-to-ms?bpm=174')
})

test('every click a row can send passes the catalogue\'s gate unchanged', () => {
  assert.ok(Object.hasOwn(EVENTS, 'bpm_chart_link_clicked'))
  assert.deepEqual(PARAMS.chart_row.values, CHART_ROW_IDS)
  for (const row of rows) {
    for (const { tool } of CHART_TOOLS) {
      const params = { bpm: row.play, tool, chart_row: row.id }
      assert.deepEqual(gateEvent('bpm_chart_link_clicked', params), { params, problems: [] }, `${row.id} → ${tool}`)
    }
  }
})

test('the page is linked from the metronome and BPM to ms, not from the home', () => {
  for (const page of ['metronome.md', 'bpm-to-ms.md']) assert.ok(read(`../${page}`).includes('](/tempo-markings)'), page)
  assert.ok(!read('../index.md').includes('/tempo-markings'), 'index.md')
  assert.ok(!read('../.vitepress/tools/site-nav.ts').includes('/tempo-markings'), 'the nav shows on the home too')
  const page = read('../tempo-markings.md')
  for (const part of ['<TempoChart section="italian" />', '<TempoChart section="genre" />', '<TempoChartSources />', '](/tap-tempo)']) {
    assert.ok(page.includes(part), part)
  }
})
