// Run with `npm test` (node --test, Node's own type stripping; no test framework).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MIC_LISTENING_LINE,
  QUIET_AFTER_MS,
  QUIET_DBFS,
  TAP_OFFER_AFTER_MS,
  isTooQuiet,
  micStatusLine,
  nextQuietSince,
  offersTapAlong,
  rmsDbfs,
} from '../.vitepress/tools/mic-guard.ts'

test('rmsDbfs reads a full-scale square as 0 dBFS and silence as -Infinity', () => {
  assert.equal(rmsDbfs([1, -1, 1, -1]), 0)
  assert.equal(rmsDbfs(new Float32Array(64)), Number.NEGATIVE_INFINITY)
  assert.equal(rmsDbfs([]), Number.NEGATIVE_INFINITY)
  // A tenth of full scale is -20 dBFS.
  assert.ok(Math.abs(rmsDbfs([0.1, -0.1, 0.1, -0.1]) - -20) < 1e-9)
})

test('a quiet stretch starts once, holds while quiet and clears on sound', () => {
  const quiet = QUIET_DBFS - 10
  const loud = QUIET_DBFS + 10
  let since = nextQuietSince(null, quiet, 1000)
  assert.equal(since, 1000)
  since = nextQuietSince(since, quiet, 2000)
  assert.equal(since, 1000)
  assert.equal(nextQuietSince(since, loud, 2500), null)
  assert.equal(nextQuietSince(null, Number.NEGATIVE_INFINITY, 10), 10)
})

test('a broken level read never raises the quiet hint', () => {
  assert.equal(nextQuietSince(500, Number.NaN, 9000), null)
})

test('too quiet only after the level stayed low for the whole window', () => {
  assert.equal(isTooQuiet(null, 1e9), false)
  assert.equal(isTooQuiet(0, QUIET_AFTER_MS - 1), false)
  assert.equal(isTooQuiet(0, QUIET_AFTER_MS), true)
})

test('tapping along is offered after the wait, and never once the tempo locked', () => {
  assert.equal(offersTapAlong(0, TAP_OFFER_AFTER_MS - 1, false), false)
  assert.equal(offersTapAlong(0, TAP_OFFER_AFTER_MS, false), true)
  assert.equal(offersTapAlong(0, TAP_OFFER_AFTER_MS * 4, true), false)
})

test('the status line puts an interruption first, then no audio, then a quiet input', () => {
  assert.equal(micStatusLine({ paused: false, audioLost: false, tooQuiet: false }), MIC_LISTENING_LINE)
  assert.match(micStatusLine({ paused: true, audioLost: true, tooQuiet: true }), /^Paused/)
  assert.match(micStatusLine({ paused: false, audioLost: true, tooQuiet: true }), /^No sound/)
  assert.match(micStatusLine({ paused: false, audioLost: false, tooQuiet: true }), /^Too quiet/)
})
