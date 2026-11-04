// Run with `npm test` (node --test, Node's own type stripping; no test framework).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  bandFlux,
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
  const firstBeat = firstBeatOf(curve, tempo)
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
  const firstBeat = firstBeatOf(curve, tempo)!
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

test('fitTempo: a fitted grid carries its phase, a beat of the grid in seconds', () => {
  const truth = { offset: 0.31, bpm: 127.6 }
  const tempo = fitTempo(onsetCurve(track(truth.bpm, truth.offset, 60, SAMPLE_RATE, true), SAMPLE_RATE), 128)
  assert.ok(tempo.fitted)
  const period = 60 / tempo.bpm
  const off = (((tempo.phase - truth.offset) % period) + 1.5 * period) % period - period / 2
  assert.ok(Math.abs(off) < 0.015, `phase ${tempo.phase} sits ${off} s off the beats`)
})

/** A kick with a smooth tail, so the end of the sound is no onset of its own (the review's trap). */
function addKick(samples: Float32Array, time: number, sampleRate = SAMPLE_RATE): void {
  const start = Math.round(time * sampleRate)
  const length = Math.round(0.4 * sampleRate)
  const click = Math.round(0.02 * sampleRate)
  for (let i = 0; i < length && start + i < samples.length; i += 1) {
    const fade = Math.min(1, (length - i) / 2000)
    samples[start + i] = samples[start + i]! + fade * (0.8 * Math.exp(-i / (0.03 * sampleRate)) * Math.sin((2 * Math.PI * 60 * i) / sampleRate)
      + (i < click ? 0.3 * (1 - i / click) * Math.sin((2 * Math.PI * 1000 * i) / sampleRate) : 0))
  }
}

function smoothKicks(times: number[], seconds: number): Float32Array {
  const samples = new Float32Array(Math.round(seconds * SAMPLE_RATE))
  for (const time of times) addKick(samples, time)
  return samples
}

/** Marker 1 the way the export finds it: the fitted tempo, then the first beat on its grid. */
function markerOne(samples: Float32Array, wholeBpm: number): number | null {
  const curve = onsetCurve(samples, SAMPLE_RATE)
  return firstBeatOf(curve, fitTempo(curve, wholeBpm))
}

test('firstBeatOf: a loud noise bed from the first sample does not pull marker 1 off the beat', () => {
  // Kicks at 120 BPM from `start`, white noise from 0 s: before, marker 1 sat on the first noise
  // onset, 20 to 300 ms in. Now it is a kick: the first, or the second when the first one's onset
  // reads weak out of the noise (the curve's loudness jumps in that frame).
  for (const [start, dbfs] of [[0.13, -20], [0.77, -26], [1.31, -29], [2.06, -32]] as const) {
    const beats = Array.from({ length: 76 }, (_, index) => start + index * 0.5)
    const first = markerOne(hiss(smoothKicks(beats, 40), dbfs), 120)
    const onAKick = first !== null && [start, start + 0.5].some((beat) => Math.abs(first - beat) < 1 / 30)
    assert.ok(onAKick, `kicks from ${start} s under ${dbfs} dBFS: marker 1 at ${first}`)
  }
  // Here it is the first kick itself: its onset passes half the strong bar, and the kicks after
  // it pass the full bar (FIRST_BEAT_FRACTION).
  for (const [start, dbfs] of [[0.42, -26], [0.77, -29], [1.31, -29]] as const) {
    const first = markerOne(hiss(smoothKicks(Array.from({ length: 76 }, (_, index) => start + index * 0.5), 40), dbfs), 120)
    assert.ok(first !== null && Math.abs(first - start) < 1 / 30, `kicks from ${start} s under ${dbfs} dBFS: marker 1 at ${first}`)
  }
})

test('firstBeatOf: half-time kicks under off-beat hats start on the first kick, not on a hat', () => {
  // Kicks on every other beat of 127.6 BPM, hats on every off-beat. The first strong onsets
  // alternate, and a fit anchored on a hat steps on the hats, a whole grid half a beat late.
  const period = 60 / 127.6
  const count = Math.floor((40 - 0.4) / period)
  const samples = smoothKicks(Array.from({ length: count }, (_, index) => 0.4 + index * period).filter((_, index) => index % 2 === 0), 40)
  const hats = clicks(Array.from({ length: count }, (_, index) => 0.4 + (index + 0.5) * period), 40)
  for (let i = 0; i < samples.length; i += 1) samples[i] = samples[i]! + 0.15 * hats[i]!
  const first = markerOne(samples, 128)
  assert.ok(first !== null && Math.abs(first - 0.4) < 1 / 30, `marker 1 at ${first}`)
})

test('firstBeatOf: a count-in click off the beat is not marker 1', () => {
  for (const gain of [0.1, 0.01]) {
    const samples = smoothKicks(Array.from({ length: 76 }, (_, index) => 2 + index * 0.5), 40)
    const click = clicks([0.83], 40)
    for (let i = 0; i < samples.length; i += 1) samples[i] = samples[i]! + gain * click[i]!
    const first = markerOne(samples, 120)
    assert.ok(first !== null && Math.abs(first - 2) < 1 / 30, `click at ${gain}: marker 1 at ${first}`)
  }
})

test('firstBeatOf: live drums that open on a beat keep marker 1 at 0 s, on the kicks, not the hats', () => {
  // A kick on the first sample, the later kicks and the off-beat hats up to 15 ms early or late.
  // The fitted grid averages that out, where a one-frame check of the next four beats lost the
  // start. The hats make a grid as steady as the kicks', half a beat away: the first strong
  // onset is a hat (the kick on the first sample is invisible), and the fit must not stay there.
  for (const bpm of [174, 92.4]) {
    let seed = 17
    const jitter = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
      return (seed / 1_073_741_824 - 1) * 0.015
    }
    const period = 60 / bpm
    const count = Math.floor(40 / period)
    const samples = smoothKicks(Array.from({ length: count }, (_, index) => index * period + (index === 0 ? 0 : jitter())), 40)
    const hats = clicks(Array.from({ length: count }, (_, index) => (index + 0.5) * period + jitter()), 40)
    for (let i = 0; i < samples.length; i += 1) samples[i] = samples[i]! + 0.15 * hats[i]!
    const curve = onsetCurve(samples, SAMPLE_RATE)
    const tempo = fitTempo(curve, Math.round(bpm))
    assert.ok(tempo.fitted, `${bpm} BPM`)
    const offBeat = Math.abs(((tempo.phase / period) % 1) - 0.5)
    assert.ok(offBeat > 0.4, `${bpm} BPM: phase ${tempo.phase} is on the hats`)
    const first = firstBeatOf(curve, tempo)
    assert.ok(first !== null && first < 1 / 30, `${bpm} BPM: marker 1 at ${first}`)
  }
})

test('firstBeatOf: a clip cut mid-sound off the fitted grid does not start at 0', () => {
  const samples = smoothKicks(Array.from({ length: 76 }, (_, index) => 0.23 + index * 0.5), 40)
  for (let i = 0; i < samples.length; i += 1) samples[i] = samples[i]! + 0.5 * Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE)
  const first = markerOne(samples, 120)
  assert.ok(first !== null && Math.abs(first - 0.23) < 1 / 30, `marker 1 at ${first}`)
})

test('fitTempo: the share of beats on onsets counts over the whole file, not from the grid\'s anchor', () => {
  // Kicks to 20 s with a clap on them from 12 s, silence, then two beats: 42 of the file's 80
  // beats land on onsets, a steady half, but from the claps the fit anchors on it is 18 of 56.
  const beats = Array.from({ length: 80 }, (_, index) => 0.4 + index * 0.5).filter((time) => time < 20 || time >= 39)
  const samples = smoothKicks(beats, 40)
  const claps = clicks(beats.filter((time) => time >= 12), 40)
  for (let i = 0; i < samples.length; i += 1) samples[i] = samples[i]! + 0.6 * claps[i]!
  const tempo = fitTempo(onsetCurve(samples, SAMPLE_RATE), 120)
  assert.ok(tempo.fitted && Math.abs(tempo.bpm - 120) < 0.01, JSON.stringify(tempo))
})

test('bandFlux: the mean rise of the log magnitudes over a band, falls ignored', () => {
  const now = Float64Array.from([9, 3, 5, 1, 4])
  const before = Float64Array.from([0, 1, 7, 0, 2])
  // Bins 1 to 3: rises of 2 and 1, a fall of 2 that counts for nothing, over 3 bins.
  assert.equal(bandFlux(now, before, 1, 4), 1)
  assert.equal(bandFlux(now, now, 0, 5), 0)
  assert.equal(bandFlux(now, before, 2, 2), 0)
  // Pure: the inputs are read, never written.
  assert.deepEqual([...before], [0, 1, 7, 0, 2])
})

test('onsetCurve: the same curve, bit for bit, as before the band-flux split', () => {
  const pinned: Record<number, [number, string]> = {
    44_100: [17.09016626595112, '5a0ff01fa4719d2ec07f0ad2681f2801ff9065fad2b2b96b5faf10868c654783'],
    48_000: [17.119133670821387, '0e608a7e18887423d0df0ad5286eb5096ba98e7dc920e6a196fbde70adceef39'],
  }
  for (const [rate, [startStrength, hash]] of Object.entries(pinned).map(([key, value]) => [Number(key), value] as const)) {
    let seed = 1
    const samples = Float32Array.from({ length: rate * 3 }, (_, i) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
      return 0.3 * Math.sin((2 * Math.PI * 220 * i) / rate) * (i % Math.round(rate / 2) < rate / 20 ? 1 : 0.05) + 0.01 * (seed / 1_073_741_824 - 1)
    })
    const curve = onsetCurve(samples, rate)
    assert.equal(curve.startStrength, startStrength)
    assert.equal(createHash('sha256').update(new Uint8Array(curve.strength.buffer)).digest('hex'), hash, `${rate} Hz`)
  }
})
