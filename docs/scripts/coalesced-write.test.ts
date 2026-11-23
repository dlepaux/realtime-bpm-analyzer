// Run with `npm test` (node --test, Node's own type stripping; no test framework).
// The metronome saves a click at once and a drag once per spell (RBA-276).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { coalescedWrite, type Timers } from '../.vitepress/tools/coalesced-write.ts'

// Timers that run only when the test says time has passed.
function fakeTimers(): Timers & { advance: (ms: number) => void; pending: () => number } {
  let now = 0
  let nextId = 1
  const due = new Map<number, { at: number; run: () => void }>()
  return {
    setTimeout: (run, ms) => { due.set(nextId, { at: now + ms, run }); return nextId++ },
    clearTimeout: (id) => { if (id !== undefined) due.delete(id) },
    advance: (ms) => {
      now += ms
      for (const [id, timer] of [...due].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at > now) continue
        due.delete(id)
        timer.run()
      }
    },
    pending: () => due.size,
  }
}

function setup() {
  const timers = fakeTimers()
  let writes = 0
  const saver = coalescedWrite(() => writes++, 400, timers)
  return { timers, saver, writes: () => writes }
}

test('a lone change is written at once', () => {
  const { saver, writes } = setup()
  saver.request()
  assert.equal(writes(), 1)
})

test('changes within the spell become one write at its end', () => {
  const { timers, saver, writes } = setup()
  saver.request()
  for (let i = 0; i < 30; i++) saver.request()
  assert.equal(writes(), 1)
  timers.advance(400)
  assert.equal(writes(), 2)
  // Nothing more waiting: the next spell ends quietly.
  timers.advance(400)
  assert.equal(writes(), 2)
  assert.equal(timers.pending(), 0)
})

test('a drag of 30 s writes at most once per spell, under Safari\'s 100 per 30 s', () => {
  const { timers, saver, writes } = setup()
  for (let t = 0; t < 30_000; t += 16) {
    saver.request()
    timers.advance(16)
  }
  assert.ok(writes() <= 30_000 / 400 + 1, `${writes()} writes`)
  assert.ok(writes() > 1)
})

test('flush writes a waiting change, and only a waiting one', () => {
  const { timers, saver, writes } = setup()
  saver.flush()
  assert.equal(writes(), 0)
  saver.request()
  saver.request()
  saver.flush()
  assert.equal(writes(), 2)
  // The flushed change isn't written again when the spell ends.
  timers.advance(400)
  assert.equal(writes(), 2)
})

test('cancel drops the timer and any waiting change', () => {
  const { timers, saver, writes } = setup()
  saver.request()
  saver.request()
  saver.cancel()
  timers.advance(1000)
  assert.equal(writes(), 1)
  assert.equal(timers.pending(), 0)
})

test('a flush runs flushWrite when one is given, and the spell then ends quietly', () => {
  const timers = fakeTimers()
  const calls: string[] = []
  const saver = coalescedWrite(() => calls.push('write'), 400, timers, () => calls.push('flush'))
  saver.request()
  saver.request()
  saver.flush()
  timers.advance(400)
  assert.deepEqual(calls, ['write', 'flush'])
})
