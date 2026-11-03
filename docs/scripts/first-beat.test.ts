// Run with `npm test` (node --test, Node's own type stripping; no test framework).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  firstBeatSeconds,
  firstBeatSecondsInSlices,
  firstStrongFrame,
  frameTime,
  onsetCurve,
} from '../.vitepress/tools/first-beat.ts'

const SAMPLE_RATE = 44_100

/** Decaying noise bursts, a click track the onset curve sees plainly. */
function clicks(times: number[], seconds: number, sampleRate = SAMPLE_RATE): Float32Array {
  const samples = new Float32Array(Math.round(seconds * sampleRate))
  let seed = 1
  const noise = () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
    return seed / 1_073_741_824 - 1
  }
  for (const time of times) {
    const start = Math.round(time * sampleRate)
    for (let i = 0; i < 0.03 * sampleRate && start + i < samples.length; i += 1) {
      samples[start + i] = noise() * Math.exp(-i / (0.005 * sampleRate))
    }
  }
  return samples
}

test('frameTime: the benchmark constant at 44.1 kHz, (i + 1) / 100 s less 512 / 44100 s', () => {
  const curve = onsetCurve(new Float32Array(SAMPLE_RATE), SAMPLE_RATE)
  assert.equal(curve.hop, 441)
  assert.equal(curve.fftSize, 1024)
  assert.ok(Math.abs(frameTime(curve, 99) - (1 - 512 / SAMPLE_RATE)) < 1e-12)
})

test('onsetCurve: one frame per hop at 48 kHz too, with the window scaled to the rate', () => {
  const curve = onsetCurve(new Float32Array(48_000 * 2), 48_000)
  assert.equal(curve.hop, 480)
  assert.equal(curve.fftSize, 1024)
  assert.equal(curve.strength.length, 200)
  assert.throws(() => onsetCurve(new Float32Array(10), 50), RangeError)
})

test('firstStrongFrame: the first frame at the 90th percentile, null for silence', () => {
  assert.equal(firstStrongFrame(Float32Array.from([0, 1, 5, 2, 9, 9, 1, 0, 0, 3])), 4)
  assert.equal(firstStrongFrame(new Float32Array(50)), null)
  assert.equal(firstStrongFrame(new Float32Array(0)), null)
  // Mostly silence puts the percentile at 0: the first frame above zero, not frame 0.
  assert.equal(firstStrongFrame(Float32Array.from([0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 3])), 3)
})

test('firstBeatSeconds: the first click of a 120 BPM track after a second of silence', () => {
  const beats = Array.from({ length: 16 }, (_, index) => 1 + index * 0.5)
  const first = firstBeatSeconds(clicks(beats, 10), SAMPLE_RATE)
  assert.ok(first !== null)
  // Within a frame and a half of the click: the curve's 10 ms frames and half-window delay.
  assert.ok(Math.abs(first - 1) < 0.015, `first beat at ${first}`)
})

test('firstBeatSeconds: the same at 48 kHz, the usual browser rate', () => {
  const beats = Array.from({ length: 12 }, (_, index) => 0.73 + index * 0.6)
  const first = firstBeatSeconds(clicks(beats, 8, 48_000), 48_000)
  assert.ok(first !== null && Math.abs(first - 0.73) < 0.015, `first beat at ${first}`)
})

test('firstBeatSeconds: null for silence', () => {
  assert.equal(firstBeatSeconds(new Float32Array(SAMPLE_RATE * 3), SAMPLE_RATE), null)
})

test('firstBeatSecondsInSlices: the same answer, pausing between slices, and stops when cancelled', async () => {
  const samples = clicks(Array.from({ length: 20 }, (_, index) => 2.2 + index * 0.4), 12)
  let pauses = 0
  const pause = async () => { pauses += 1 }
  assert.equal(await firstBeatSecondsInSlices(samples, SAMPLE_RATE, pause), firstBeatSeconds(samples, SAMPLE_RATE))
  assert.ok(pauses >= 5, `${pauses} pauses`)
  assert.equal(await firstBeatSecondsInSlices(samples, SAMPLE_RATE, pause, () => true), null)
})
