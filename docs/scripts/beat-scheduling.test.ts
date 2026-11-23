// Run with `npm test`. The scheduling and tap steps the metronome and the strobe light share
// so the two pages keep one beat grid and one way of reading taps.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_TICKS_PER_CALL, TAPS_TO_SET, tapToSet, ticksBefore } from '../.vitepress/tools/tempo.ts'

test('ticksBefore: books every tick due before the horizon, one step apart, and hands on the cursor', () => {
  const { due, next } = ticksBefore({ tick: 4, time: 1 }, 2.2, 0.5)
  assert.deepEqual(due, [
    { tick: 4, time: 1 },
    { tick: 5, time: 1.5 },
    { tick: 6, time: 2 },
  ])
  assert.deepEqual(next, { tick: 7, time: 2.5 })
})

test('ticksBefore: a tick exactly on the horizon waits for the next call', () => {
  const { due, next } = ticksBefore({ tick: 0, time: 2 }, 2, 0.5)
  assert.deepEqual(due, [])
  assert.deepEqual(next, { tick: 0, time: 2 })
})

test('ticksBefore: each call follows the step it is given, so a tempo change takes effect on the next tick', () => {
  const first = ticksBefore({ tick: 0, time: 0 }, 1, 0.5)
  const second = ticksBefore(first.next, 2, 0.25)
  assert.deepEqual(second.due.map((t) => t.time), [1, 1.25, 1.5, 1.75])
  assert.deepEqual(second.due.map((t) => t.tick), [2, 3, 4, 5])
})

test('ticksBefore: bounded, so a stalled timer never books an unbounded burst in one call', () => {
  const { due, next } = ticksBefore({ tick: 0, time: 0 }, 1e9, 0.01)
  assert.equal(due.length, MAX_TICKS_PER_CALL)
  assert.equal(next.tick, MAX_TICKS_PER_CALL)
  // Time adds up step by step, as the metronome's always has, so it is close, not exact.
  assert.ok(Math.abs(next.time - MAX_TICKS_PER_CALL * 0.01) < 1e-9, String(next.time))
})

test('ticksBefore: refuses a step that would never advance', () => {
  for (const step of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => ticksBefore({ tick: 0, time: 0 }, 1, step), RangeError, String(step))
  }
})

test('tapToSet: the tempo is set from the third tap of a run, as the metronome always did', () => {
  assert.equal(TAPS_TO_SET, 3)
  let taps: number[] = []
  const bpms: (number | null)[] = []
  for (const at of [0, 500, 1000, 1500]) {
    const result = tapToSet(taps, at)
    taps = result.taps
    bpms.push(result.bpm)
  }
  assert.deepEqual(bpms, [null, null, 120, 120])
  assert.equal(taps.length, 4)
})

test('tapToSet: a pause starts a new run, which needs three taps again', () => {
  const run = [0, 500, 1000].reduce<number[]>((taps, at) => tapToSet(taps, at).taps, [])
  const after = tapToSet(run, 10_000)
  assert.deepEqual(after.taps, [10_000])
  assert.equal(after.bpm, null)
})

test('tapToSet: the tempo comes out rounded and inside the supported range', () => {
  const fast = [0, 100, 200].reduce<{ taps: number[]; bpm: number | null }>((acc, at) => tapToSet(acc.taps, at), { taps: [], bpm: null })
  assert.equal(fast.bpm, 300)
  const odd = [0, 487, 974].reduce<{ taps: number[]; bpm: number | null }>((acc, at) => tapToSet(acc.taps, at), { taps: [], bpm: null })
  assert.equal(odd.bpm, 123)
})
