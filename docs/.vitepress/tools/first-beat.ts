// Where the beat grid of the marker export starts: the first strong onset in the decoded audio.
//
// This is the RBA-109 phase 0 grid baseline (benchmark/beats_tracker.py `grid_baseline`, PR #332),
// ported to the site on purpose and not into packages/: it is a demand test (RBA-127), and the
// library's own beat API is phase 1 of RBA-109. The onset curve below is the library's tempogram
// `onsetCurve` (packages/realtime-bpm-analyzer/src/core/tempogram.ts, defaultTempogramTuning) at
// 100 frames a second, so the baseline is scored on the same curve the benchmark read. If the
// library's onset stage changes, this copy does not follow it, which is acceptable for a test.
//
// Pure and import-free so `npm test` runs it with plain `node --test` (scripts/first-beat.test.ts).

const FRAME_RATE = 100
const BANDS = [30, 200, 500, 1500, 4000, 10_000]
const COMPRESSION = 1000
const LOCAL_MEAN_SECONDS = 0.5
const LOUDNESS_DECAY = 0.9995
const MINIMUM_LOUDNESS = 0.05
/** The baseline's "strong": the curve's 90th percentile (STRONG_QUANTILE in beats_tracker.py). */
const STRONG_QUANTILE = 0.9

export interface OnsetCurve {
  /** Onset strength per frame. Frame i is computed once (i + 1) hops of audio are in. */
  strength: Float32Array
  hop: number
  fftSize: number
  sampleRate: number
}

function fftOf(size: number): (re: Float64Array, im: Float64Array) => void {
  const bits = Math.log2(size)
  const reversed = new Uint32Array(size)
  for (let i = 0; i < size; i += 1) {
    let value = 0
    for (let bit = 0; bit < bits; bit += 1) value = (value << 1) | ((i >> bit) & 1)
    reversed[i] = value
  }
  const cosines = Float64Array.from({ length: size / 2 }, (_, i) => Math.cos((2 * Math.PI * i) / size))
  const sines = Float64Array.from({ length: size / 2 }, (_, i) => -Math.sin((2 * Math.PI * i) / size))

  return (re, im) => {
    for (let i = 0; i < size; i += 1) {
      const j = reversed[i]!
      if (j > i) {
        ;[re[i], re[j]] = [re[j]!, re[i]!]
        ;[im[i], im[j]] = [im[j]!, im[i]!]
      }
    }
    for (let half = 1; half < size; half *= 2) {
      const step = size / (2 * half)
      for (let start = 0; start < size; start += 2 * half) {
        for (let k = 0; k < half; k += 1) {
          const a = start + k
          const b = a + half
          const wr = cosines[k * step]!
          const wi = sines[k * step]!
          const tr = re[b]! * wr - im[b]! * wi
          const ti = re[b]! * wi + im[b]! * wr
          re[b] = re[a]! - tr
          im[b] = im[a]! - ti
          re[a] = re[a]! + tr
          im[a] = im[a]! + ti
        }
      }
    }
  }
}

/**
 * The library's onset strength of a recording, band-wise log spectral flux above a local mean,
 * computed `frames` at a time so a caller can yield to the page between steps.
 */
export function onsetStepper(samples: Float32Array, sampleRate: number): { curve: OnsetCurve; step: (frames: number) => boolean } {
  if (!(sampleRate >= FRAME_RATE)) throw new RangeError(`Invalid sample rate: ${sampleRate}`)
  const hop = Math.round(sampleRate / FRAME_RATE)
  const frameRate = sampleRate / hop
  const fftSize = 2 ** Math.round(Math.log2(0.023 * sampleRate))
  const bins = fftSize / 2
  const fft = fftOf(fftSize)
  const hann = Float64Array.from({ length: fftSize }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / fftSize))
  const re = new Float64Array(fftSize)
  const im = new Float64Array(fftSize)
  const previousLog = new Float64Array(bins)
  const edges = BANDS.map((hz) => Math.min(bins, Math.max(1, Math.round((hz / (sampleRate / 2)) * bins))))
  const localMeans = new Float64Array(edges.length - 1)
  const meanStep = 1 / (LOCAL_MEAN_SECONDS * frameRate)
  const strength = new Float32Array(Math.floor(samples.length / hop))
  let loudness = MINIMUM_LOUDNESS
  let frame = 0

  function computeFrame(): void {
    // The window is the fftSize samples that end after (frame + 1) hops, zeros before the start.
    const end = (frame + 1) * hop
    for (let i = 0; i < fftSize; i += 1) {
      const index = end - fftSize + i
      re[i] = (index >= 0 ? samples[index]! : 0) * hann[i]!
    }
    im.fill(0)
    fft(re, im)

    let peak = 0
    for (let bin = 1; bin < bins; bin += 1) {
      const power = re[bin]! * re[bin]! + im[bin]! * im[bin]!
      re[bin] = power
      if (power > peak) peak = power
    }
    loudness = Math.max(Math.sqrt(peak), loudness * LOUDNESS_DECAY, MINIMUM_LOUDNESS)
    const scale = COMPRESSION / loudness

    let total = 0
    for (let band = 0; band < localMeans.length; band += 1) {
      const first = edges[band]!
      const last = edges[band + 1]!
      let flux = 0
      for (let bin = first; bin < last; bin += 1) {
        const logarithm = Math.log(1 + scale * Math.sqrt(re[bin]!))
        const rise = logarithm - previousLog[bin]!
        previousLog[bin] = logarithm
        if (rise > 0) flux += rise
      }
      flux /= Math.max(1, last - first)
      localMeans[band] = localMeans[band]! + meanStep * (flux - localMeans[band]!)
      const novelty = flux - localMeans[band]!
      if (novelty > 0) total += novelty
    }
    // The first frame rises from silence, which is no onset.
    strength[frame] = frame === 0 ? 0 : total
  }

  /** Computes up to `frames` more frames; true once the whole curve is done. */
  function step(frames: number): boolean {
    const end = Math.min(strength.length, frame + frames)
    for (; frame < end; frame += 1) computeFrame()
    return frame >= strength.length
  }

  return { curve: { strength, hop, fftSize, sampleRate }, step }
}

/** The whole onset curve in one go. */
export function onsetCurve(samples: Float32Array, sampleRate: number): OnsetCurve {
  const { curve, step } = onsetStepper(samples, sampleRate)
  step(curve.strength.length)
  return curve
}

/**
 * Seconds of audio that onset frame i describes: the end of its window less half a window.
 * At 44.1 kHz this is beats_tracker.py's `(i + 1) / 100 - 512 / 44100`.
 */
export function frameTime(curve: OnsetCurve, frame: number): number {
  return ((frame + 1) * curve.hop - curve.fftSize / 2) / curve.sampleRate
}

/**
 * The first frame at or above the curve's 90th percentile, or null for a silent or empty curve.
 * One departure from the benchmark: the frame must also be above zero. On sparse audio (a few
 * clicks, mostly silence) the percentile is 0, and the benchmark would start the grid on frame 0.
 */
export function firstStrongFrame(strength: Float32Array): number | null {
  if (strength.length === 0) return null
  const sorted = Float32Array.from(strength).sort()
  const threshold = sorted[Math.floor(STRONG_QUANTILE * (sorted.length - 1))]!
  const index = strength.findIndex((value) => value >= threshold && value > 0)
  return index === -1 ? null : index
}

function firstBeatOf(curve: OnsetCurve): number | null {
  const frame = firstStrongFrame(curve.strength)
  return frame === null ? null : Math.max(0, frameTime(curve, frame))
}

/** Time of the first strong onset in seconds, never before 0, or null when the audio has none. */
export function firstBeatSeconds(samples: Float32Array, sampleRate: number): number | null {
  return firstBeatOf(onsetCurve(samples, sampleRate))
}

/** Frames per slice: about 2 s of audio, a few tens of milliseconds of work on a phone. */
const SLICE_FRAMES = 200

/**
 * The same, a slice at a time, waiting on `pause` between slices so a long song never blocks
 * the page. `isCancelled` stops the work early, for a result the visitor has already left.
 */
export async function firstBeatSecondsInSlices(
  samples: Float32Array,
  sampleRate: number,
  pause: () => Promise<void>,
  isCancelled: () => boolean = () => false,
): Promise<number | null> {
  const { curve, step } = onsetStepper(samples, sampleRate)
  while (!step(SLICE_FRAMES)) {
    await pause()
    if (isCancelled()) return null
  }
  return firstBeatOf(curve)
}
