// Run with `npm test`. The rules behind the home tool's readout: the one alternate reading it
// offers, and the beat dot's period.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BEAT_DOT_HALF_ABOVE, alternateReading, beatPeriodMs } from '../.vitepress/tools/tempo-readout.ts'

test('alternateReading: double under 100, half over 150, nothing in between', () => {
  assert.deepEqual(alternateReading(72), { kind: 'double', bpm: 144 })
  assert.deepEqual(alternateReading(99), { kind: 'double', bpm: 198 })
  assert.equal(alternateReading(100), null)
  assert.equal(alternateReading(128), null)
  assert.equal(alternateReading(150), null)
  assert.deepEqual(alternateReading(151), { kind: 'half', bpm: 75.5 })
  assert.deepEqual(alternateReading(174), { kind: 'half', bpm: 87 })
})

test('alternateReading: never more than one, and nothing for a reading that is not a tempo', () => {
  for (let bpm = 30; bpm <= 300; bpm++) {
    const alternate = alternateReading(bpm)
    if (alternate) assert.ok(['double', 'half'].includes(alternate.kind))
  }
  for (const bad of [0, -120, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(alternateReading(bad), null, String(bad))
})

test('beatPeriodMs: one beat at the tempo, up to the half-tempo threshold', () => {
  assert.equal(beatPeriodMs(120), 500)
  assert.equal(beatPeriodMs(60), 1000)
  assert.equal(beatPeriodMs(BEAT_DOT_HALF_ABOVE), 60_000 / 170)
})

test('beatPeriodMs: above 170 BPM the dot pulses every other beat, so it stays under 3 per second', () => {
  assert.equal(BEAT_DOT_HALF_ABOVE, 170)
  assert.equal(beatPeriodMs(171), 120_000 / 171)
  assert.equal(beatPeriodMs(200), 600)
  assert.equal(beatPeriodMs(361), 240_000 / 361)
  // WCAG 2.3.1: no more than three flashes in any one second, at any tempo the analyzer reports.
  for (let bpm = 30; bpm <= 400; bpm++) assert.ok(1000 / beatPeriodMs(bpm) <= 3, `${bpm} BPM pulses too fast`)
})

test('beatPeriodMs: a reading that is not a tempo has no period', () => {
  for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(beatPeriodMs(bad), null, String(bad))
})
