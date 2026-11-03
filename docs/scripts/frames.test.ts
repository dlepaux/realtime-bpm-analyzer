// Run with `npm test` (node --test, Node's own type stripping; no test framework).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  FRAME_RATES,
  MAX_FPS,
  framesPerBeat,
  framesPerBeats,
  isWholeFrames,
  parseFps,
  roundingDrift,
} from '../.vitepress/tools/frames.ts'

const close = (actual: number, expected: number, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} is not ${expected}`)

test('framesPerBeat: 120 BPM is half a second, so 12 frames at 24 fps and 30 at 60', () => {
  close(framesPerBeat(120, 24), 12)
  close(framesPerBeat(120, 25), 12.5)
  close(framesPerBeat(120, 60), 30)
  close(framesPerBeat(60, 30), 30)
})

test('framesPerBeat: NTSC rates use the exact fraction, not the label', () => {
  close(framesPerBeat(120, 24_000 / 1001), 12_000 / 1001)
  assert.ok(!isWholeFrames(framesPerBeat(120, 30_000 / 1001)))
})

test('framesPerBeats: a 4/4 bar at 128 BPM and 25 fps is 46.875 frames', () => {
  close(framesPerBeats(128, 25, 4), 46.875)
  close(framesPerBeats(120, 24, 3), 36)
})

test('roundingDrift: a whole count has no drift', () => {
  const drift = roundingDrift(48, 24)
  assert.equal(drift.rounded, 48)
  close(drift.frames, 0)
  close(drift.ms, 0)
})

test('roundingDrift: cutting every 47 frames for 46.875 falls an eighth of a frame late', () => {
  const drift = roundingDrift(46.875, 25)
  assert.equal(drift.rounded, 47)
  close(drift.frames, 0.125)
  close(drift.ms, 5)
})

test('roundingDrift: rounding down gives a negative drift, and never zero frames', () => {
  const drift = roundingDrift(12.4, 24)
  assert.equal(drift.rounded, 12)
  close(drift.frames, -0.4)
  assert.equal(roundingDrift(0.3, 24).rounded, 1)
})

test('FRAME_RATES: the eight common rates, in order', () => {
  assert.deepEqual(FRAME_RATES.map((rate) => rate.label), ['23.976', '24', '25', '29.97', '30', '50', '59.94', '60'])
  close(FRAME_RATES[3]!.fps, 29.97002997002997)
})

test('parseFps: labels map to the exact rate, plain numbers pass, the rest is refused', () => {
  close(parseFps('23.976')!, 24_000 / 1001)
  close(parseFps(' 59.94 ')!, 60_000 / 1001)
  assert.equal(parseFps('48'), 48)
  assert.equal(parseFps('12.5'), 12.5)
  assert.equal(parseFps(''), null)
  assert.equal(parseFps('abc'), null)
  assert.equal(parseFps('0'), null)
  assert.equal(parseFps('-24'), null)
  assert.equal(parseFps(String(MAX_FPS + 1)), null)
  assert.equal(parseFps('Infinity'), null)
})

test('parseFps: a preset written another way is the preset, so it never adds a duplicate row (RBA-124)', () => {
  assert.equal(parseFps('29.970'), FRAME_RATES[3]!.fps)
  assert.equal(parseFps('23.9760'), FRAME_RATES[0]!.fps)
  assert.equal(parseFps('59.940'), FRAME_RATES[6]!.fps)
  assert.equal(parseFps('25.0'), 25)
  assert.equal(parseFps('29.9'), 29.9)
})

test('the chart on the BPM to frames page matches framesPerBeat', () => {
  const page = readFileSync(new URL('../bpm-to-frames.md', import.meta.url), 'utf8')
  const lines = page.split('\n').filter((line) => line.startsWith('| '))
  const header = lines[0]!.split('|').slice(2, -1).map((cell) => cell.trim())
  assert.deepEqual(header, FRAME_RATES.map((rate) => rate.label))
  const rows = lines.slice(1)
  assert.ok(rows.length > 10, 'the chart moved')
  for (const row of rows) {
    const [bpm, ...cells] = row.split('|').slice(1, -1).map((cell) => Number(cell.trim()))
    FRAME_RATES.forEach((rate, i) => {
      assert.equal(cells[i], Number(framesPerBeat(bpm!, rate.fps).toFixed(2)), `${bpm} BPM at ${rate.label}`)
    })
  }
})
