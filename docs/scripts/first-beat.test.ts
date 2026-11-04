// Run with `npm test` (node --test, Node's own type stripping; no test framework).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  firstBeatSeconds,
  firstBeatOf,
  fitTempo,
  firstStrongFrame,
  frameTime,
  onsetCurve,
  onsetCurveInSlices,
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
  const first = firstBeatSeconds(clicks(beats, 10), SAMPLE_RATE, 120)
  assert.ok(first !== null)
  // Within a frame and a half of the click: the curve's 10 ms frames and half-window delay.
  assert.ok(Math.abs(first - 1) < 0.015, `first beat at ${first}`)
})

test('firstBeatSeconds: the same at 48 kHz, the usual browser rate', () => {
  const beats = Array.from({ length: 12 }, (_, index) => 0.73 + index * 0.6)
  const first = firstBeatSeconds(clicks(beats, 8, 48_000), 48_000, 100)
  assert.ok(first !== null && Math.abs(first - 0.73) < 0.015, `first beat at ${first}`)
})

test('firstBeatSeconds: null for silence', () => {
  assert.equal(firstBeatSeconds(new Float32Array(SAMPLE_RATE * 3), SAMPLE_RATE, 120), null)
})

test('onsetCurveInSlices: the same curve, pausing between slices, and stops when cancelled', async () => {
  const samples = clicks(Array.from({ length: 20 }, (_, index) => 2.2 + index * 0.4), 12)
  let pauses = 0
  const pause = async () => { pauses += 1 }
  assert.deepEqual(await onsetCurveInSlices(samples, SAMPLE_RATE, pause), onsetCurve(samples, SAMPLE_RATE))
  assert.ok(pauses >= 5, `${pauses} pauses`)
  assert.equal(await onsetCurveInSlices(samples, SAMPLE_RATE, pause, () => true), null)
})

/** The QA's kick: a decaying 60 Hz thump under a short 1 kHz click, cut off at 120 ms. */
function kicks(offset: number, period: number, seconds: number, sampleRate = SAMPLE_RATE): Float32Array {
  const samples = new Float32Array(Math.round(seconds * sampleRate))
  const length = Math.floor(0.12 * sampleRate)
  const click = Math.round(0.02 * sampleRate)
  for (let beat = 0; Math.round((offset + beat * period) * sampleRate) < samples.length; beat += 1) {
    const start = Math.round((offset + beat * period) * sampleRate)
    for (let i = 0; i < length && start + i < samples.length; i += 1) {
      samples[start + i] = 0.8 * Math.exp(-i / (0.03 * sampleRate)) * Math.sin((2 * Math.PI * 60 * i) / sampleRate)
        + (i < click ? 0.3 * (1 - i / click) * Math.sin((2 * Math.PI * 1000 * i) / sampleRate) : 0)
    }
  }
  return samples
}

test('firstBeatSeconds: a kick on the very first sample starts the grid at 0, within a frame at 30 fps', () => {
  for (const sampleRate of [SAMPLE_RATE, 48_000]) {
    const first = firstBeatSeconds(kicks(0, 0.5, 20, sampleRate), sampleRate, 120)
    assert.ok(first !== null && first < 1 / 30, `first beat at ${first} at ${sampleRate} Hz`)
  }
  // A kick a quarter second in was already right, and stays right.
  const later = firstBeatSeconds(kicks(0.25, 0.5, 20), SAMPLE_RATE, 120)
  assert.ok(later !== null && Math.abs(later - 0.25) < 1 / 30, `first beat at ${later}`)
})

test('firstBeatSeconds: audio that starts mid-sound off the grid does not start the grid at 0', () => {
  // A steady tone from the first sample, as in a clip trimmed mid-song, with the beats 230 ms in.
  const samples = clicks(Array.from({ length: 16 }, (_, index) => 0.23 + index * 0.5), 10)
  for (let i = 0; i < samples.length; i += 1) samples[i] = samples[i]! + 0.5 * Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE)
  const first = firstBeatSeconds(samples, SAMPLE_RATE, 120)
  assert.ok(first !== null && Math.abs(first - 0.23) < 0.015, `first beat at ${first}`)
})

/** Seeded white noise at an RMS level in dBFS, from `start` seconds to the end. */
function hiss(samples: Float32Array, dbfs: number, start = 0, sampleRate = SAMPLE_RATE): Float32Array {
  const out = Float32Array.from(samples)
  const rms = 10 ** (dbfs / 20)
  let seed = 7
  for (let i = Math.round(start * sampleRate); i < out.length; i += 1) {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
    out[i] = out[i]! + rms * Math.sqrt(3) * (seed / 1_073_741_824 - 1)
  }
  return out
}

test('firstBeatSeconds: a faint blip before the beats is not the first beat', () => {
  for (const amplitude of [1e-3, 1e-7]) {
    const samples = kicks(2, 0.5, 12)
    const blip = Math.round(1 * SAMPLE_RATE)
    for (let i = 0; i < 40; i += 1) samples[blip + i] = amplitude * Math.sin(i)
    const first = firstBeatSeconds(samples, SAMPLE_RATE, 120)
    assert.ok(first !== null && Math.abs(first - 2) < 1 / 30, `blip at ${amplitude}: first beat at ${first}`)
  }
})

test('firstBeatSeconds: steady hiss from the first sample, beats from 2 s', () => {
  for (const dbfs of [-100, -70]) {
    const first = firstBeatSeconds(hiss(kicks(2, 0.5, 12), dbfs), SAMPLE_RATE, 120)
    assert.ok(first !== null && Math.abs(first - 2) < 1 / 30, `hiss at ${dbfs} dBFS: first beat at ${first}`)
  }
})

test('firstBeatSeconds: the grid check holds the start at 0 only for a tempo within a frame of the beats', () => {
  const samples = kicks(0, 0.5, 20)
  // 120.4 BPM drifts 7 ms over the four checked beats: still on the beats.
  assert.ok(firstBeatSeconds(samples, SAMPLE_RATE, 120.4)! < 1 / 60)
  // Half tempo lands on every other beat, so a beat at 0 is still a beat of that grid.
  assert.ok(firstBeatSeconds(samples, SAMPLE_RATE, 60)! < 1 / 60)
  // 2% off misses the fourth beat by 40 ms, double tempo finds nothing between the beats.
  for (const bpm of [117.6, 122.4, 240]) {
    assert.notEqual(firstBeatSeconds(samples, SAMPLE_RATE, bpm), 0, `${bpm} BPM`)
  }
})

/** Kicks at an exact tempo, with quieter hi-hats on the off-beats when `hats` is set. */
function track(bpm: number, offset: number, seconds: number, sampleRate: number, hats: boolean): Float32Array {
  const period = 60 / bpm
  const samples = kicks(offset, period, seconds, sampleRate)
  if (!hats) return samples
  const hat = clicks(Array.from({ length: Math.floor(seconds / period) }, (_, index) => offset + (index + 0.5) * period), seconds, sampleRate)
  for (let i = 0; i < samples.length; i += 1) samples[i] = samples[i]! + 0.15 * hat[i]!
  return samples
}

/** How far the grid's beat nearest `at` seconds sits from the track's own beat there. */
function driftAt(at: number, grid: { firstBeat: number; bpm: number }, truth: { offset: number; bpm: number }): number {
  const beat = Math.round(((at - grid.firstBeat) * grid.bpm) / 60)
  return grid.firstBeat + (beat * 60) / grid.bpm - (truth.offset + (beat * 60) / truth.bpm)
}

test('fitTempo: the exact tempo of a 127.6 BPM track read as 128 keeps the grid within a frame at 30 fps after 3 minutes', () => {
  const truth = { offset: 0.31, bpm: 127.6 }
  const curve = onsetCurve(track(truth.bpm, truth.offset, 190, 48_000, true), 48_000)
  const tempo = fitTempo(curve, 128)
  assert.equal(tempo.fitted, true)
  const firstBeat = firstBeatOf(curve, tempo.bpm)
  assert.ok(firstBeat !== null)
  const drift = driftAt(180, { firstBeat, bpm: tempo.bpm }, truth)
  assert.ok(Math.abs(drift) < 1 / 30, `${tempo.bpm} BPM drifts ${drift} s`)
  // The whole number drifts about half a second over the same 3 minutes.
  assert.ok(Math.abs(driftAt(180, { firstBeat, bpm: 128 }, truth)) > 0.4)
})

test('fitTempo: the same for 119.8 BPM read as 120, a tempo just under the whole number', () => {
  const truth = { offset: 1.07, bpm: 119.8 }
  const curve = onsetCurve(track(truth.bpm, truth.offset, 190, SAMPLE_RATE, false), SAMPLE_RATE)
  const tempo = fitTempo(curve, 120)
  assert.equal(tempo.fitted, true)
  const firstBeat = firstBeatOf(curve, tempo.bpm)!
  const drift = driftAt(180, { firstBeat, bpm: tempo.bpm }, truth)
  assert.ok(Math.abs(drift) < 1 / 30, `${tempo.bpm} BPM drifts ${drift} s`)
})

test('fitTempo: falls back to the whole number when the onsets keep no steady beat near it', () => {
  // Onsets at random times: nothing to fit.
  let seed = 3
  const random = () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
    return seed / 2_147_483_648
  }
  const times = Array.from({ length: 60 }, () => random() * 40).sort((a, b) => a - b)
  assert.deepEqual(fitTempo(onsetCurve(clicks(times, 40), SAMPLE_RATE), 120), { bpm: 120, fitted: false })
  // A steady beat more than 1 BPM away from the reading is not this reading's tempo.
  assert.deepEqual(fitTempo(onsetCurve(track(125, 0.5, 40, SAMPLE_RATE, false), SAMPLE_RATE), 128), { bpm: 128, fitted: false })
  // Silence, and too short a file to fit.
  assert.deepEqual(fitTempo(onsetCurve(new Float32Array(SAMPLE_RATE * 5), SAMPLE_RATE), 100), { bpm: 100, fitted: false })
  assert.deepEqual(fitTempo(onsetCurve(track(120, 0.5, 3, SAMPLE_RATE, false), SAMPLE_RATE), 120), { bpm: 120, fitted: false })
})
