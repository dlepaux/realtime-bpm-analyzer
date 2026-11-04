// The beat grid of the marker export, from the decoded audio: the exact tempo it steps at and the
// grid's phase (fitTempo), and where it starts, the first beat of that grid (firstBeatOf).
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
/**
 * The quietest sound the curve still scales up, in dB below the file's peak. The library's floor
 * (MINIMUM_LOUDNESS) is absolute because it listens live and can't know what comes later, so
 * hiss at -100 dBFS before the music gets the same gain as the music itself and reads as onsets
 * as strong as the beats. A whole file is known up front: scaling stops 40 dB under its peak,
 * which keeps a -40 dB intro and drops hiss and faint clicks (scripts/first-beat.test.ts).
 */
const QUIET_FLOOR_DB = 40
/** The baseline's "strong": the curve's 90th percentile (STRONG_QUANTILE in beats_tracker.py). */
const STRONG_QUANTILE = 0.9
/**
 * A second bar for "strong", relative to the loud onsets: on sparse audio the 90th percentile is
 * 0, and any blip above zero would pass it. The loud onsets' level is the curve's LOUD_RANK-th
 * highest value (a few beats' worth, so one freak spike can't set it), or its top percent.
 */
const LOUD_FRACTION = 0.25
const LOUD_RANK = 8
const LOUD_SHARE = 0.01

export interface OnsetCurve {
  /** Onset strength per frame. Frame i is computed once (i + 1) hops of audio are in. */
  strength: Float32Array
  /**
   * What the first frames would read if they counted: the rise from the silence before the file.
   * The curve holds 0 there, where the window still reaches before the first sample (frame 0 in
   * the library's), because a clip cut mid-song rises from nothing too.
   */
  startStrength: number
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
 * The mean rise of the log magnitudes from `previous` to `now` over bins [first, last), falls
 * counted as 0: the library's spectral flux in one band.
 */
export function bandFlux(now: Float64Array, previous: Float64Array, first: number, last: number): number {
  let flux = 0
  for (let bin = first; bin < last; bin += 1) {
    const rise = now[bin]! - previous[bin]!
    if (rise > 0) flux += rise
  }
  return flux / Math.max(1, last - first)
}

/** Hann-windowed power spectrum of the fftSize samples that end at `end`, zeros before the start. */
function powerSpectrum(samples: Float32Array, end: number, hann: Float64Array, fft: (re: Float64Array, im: Float64Array) => void, re: Float64Array, im: Float64Array): void {
  for (let i = 0; i < hann.length; i += 1) {
    const index = end - hann.length + i
    re[i] = (index >= 0 ? samples[index]! : 0) * hann[i]!
  }
  im.fill(0)
  fft(re, im)
  for (let bin = 1; bin < hann.length / 2; bin += 1) re[bin] = re[bin]! * re[bin]! + im[bin]! * im[bin]!
}

/**
 * The library's onset strength of a recording, band-wise log spectral flux above a local mean,
 * computed `frames` at a time so a caller can yield to the page between steps.
 */
export function onsetStepper(samples: Float32Array, sampleRate: number): { curve: OnsetCurve; step: (frames: number) => boolean } {
  if (!(sampleRate >= FRAME_RATE)) throw new RangeError(`Invalid sample rate: ${sampleRate}`)
  const hop = Math.round(sampleRate / FRAME_RATE)
  const fftSize = 2 ** Math.round(Math.log2(0.023 * sampleRate))
  const bins = fftSize / 2
  const fft = fftOf(fftSize)
  const hann = Float64Array.from({ length: fftSize }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / fftSize))
  const re = new Float64Array(fftSize)
  const im = new Float64Array(fftSize)
  // This frame's log magnitudes and the last frame's, swapped after each frame.
  let logs = new Float64Array(bins)
  let previousLogs = new Float64Array(bins)
  const edges = BANDS.map((hz) => Math.min(bins, Math.max(1, Math.round((hz / (sampleRate / 2)) * bins))))
  const localMeans = new Float64Array(edges.length - 1)
  const meanStep = 1 / (LOCAL_MEAN_SECONDS * (sampleRate / hop))
  const strength = new Float32Array(Math.floor(samples.length / hop))
  // A full-scale sine of amplitude A peaks at A * fftSize / 4 under a Hann window.
  const quietFloor = Math.max(MINIMUM_LOUDNESS, (peakAmplitude(samples) * fftSize) / 4 * 10 ** (-QUIET_FLOOR_DB / 20))
  let loudness = quietFloor
  let frame = 0
  const curve: OnsetCurve = { strength, startStrength: 0, hop, fftSize, sampleRate }

  function computeFrame(): void {
    const end = (frame + 1) * hop
    powerSpectrum(samples, end, hann, fft, re, im)
    let peak = 0
    for (let bin = 1; bin < bins; bin += 1) peak = Math.max(peak, re[bin]!)
    loudness = Math.max(Math.sqrt(peak), loudness * LOUDNESS_DECAY, quietFloor)
    const scale = COMPRESSION / loudness
    for (let bin = edges[0]!; bin < edges[edges.length - 1]!; bin += 1) logs[bin] = Math.log(1 + scale * Math.sqrt(re[bin]!))

    let total = 0
    for (let band = 0; band < localMeans.length; band += 1) {
      const flux = bandFlux(logs, previousLogs, edges[band]!, edges[band + 1]!)
      localMeans[band] = localMeans[band]! + meanStep * (flux - localMeans[band]!)
      const novelty = flux - localMeans[band]!
      if (novelty > 0) total += novelty
    }
    ;[logs, previousLogs] = [previousLogs, logs]
    // A frame whose window reaches before the first sample rises from the zero padding, which is
    // no onset on its own (steady hiss rises there too). The library holds only frame 0 at 0; here
    // every padded frame is, and their rise is kept aside to tell a beat on the first sample.
    if (end < fftSize) {
      curve.startStrength = Math.max(curve.startStrength, total)
      strength[frame] = 0
    } else {
      strength[frame] = total
    }
  }

  /** Computes up to `frames` more frames; true once the whole curve is done. */
  function step(frames: number): boolean {
    const end = Math.min(strength.length, frame + frames)
    for (; frame < end; frame += 1) computeFrame()
    return frame >= strength.length
  }

  return { curve, step }
}

function peakAmplitude(samples: Float32Array): number {
  let peak = 0
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample))
  return peak
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
 * The first strong frame, or null for a silent or empty curve. Strong is the benchmark's 90th
 * percentile, and also a quarter of the loud onsets' level (strongThreshold), so on sparse audio
 * (a few clicks, mostly silence), where the percentile is 0, a faint blip doesn't pass.
 */
export function firstStrongFrame(strength: Float32Array): number | null {
  if (strength.length === 0) return null
  const threshold = strongThreshold(strength)
  const index = strength.findIndex((value) => isStrong(value, threshold))
  return index === -1 ? null : index
}

export function strongThreshold(strength: Float32Array): number {
  const sorted = Float32Array.from(strength).sort()
  const last = sorted.length - 1
  const loudRank = Math.max(LOUD_RANK, Math.ceil(LOUD_SHARE * sorted.length))
  const loud = sorted[Math.max(0, last - (loudRank - 1))]!
  return Math.max(sorted[Math.floor(STRONG_QUANTILE * last)]!, LOUD_FRACTION * loud)
}

function isStrong(value: number, threshold: number): boolean {
  return value >= threshold && value > 0
}

/**
 * Beats after the start that must land on strong onsets to call the first sample a beat, and how
 * far, in curve frames (10 ms), such an onset may sit from the grid: one frame, the curve's own
 * resolution, so the marker at 0 is within a frame at 60 fps. Over four beats that bounds the
 * tempo to about 0.5% at 120 BPM, which the fitted tempo (fitTempo) meets and a tempo 2% off
 * doesn't. Half tempo passes and should: every other beat is still a beat, and so is the one at 0.
 */
const START_CHECK_BEATS = 4
const START_CHECK_FRAMES = 1

/**
 * Whether the file opens on a beat. Frame 0 always reads 0 (see startStrength), so a beat on the
 * first sample is invisible and the grid used to start on whatever came next: on a sparse track,
 * the tail of that very kick, 120 ms in. The start counts as a beat when it rises strongly and
 * the next beats at this tempo land on strong onsets. A clip cut mid-song rises strongly too,
 * but its beats then sit off that grid, unless they happen to fall on it, where starting at 0
 * gives the same markers plus one earlier marker on the beat.
 */
function startsOnTheGrid(curve: OnsetCurve, bpm: number, threshold: number): boolean {
  if (!isStrong(curve.startStrength, threshold)) return false
  const framesPerSecond = curve.sampleRate / curve.hop
  // Frame i covers frameTime(i), so a time t falls on frame t * rate + fftSize / 2 / hop - 1.
  const lag = curve.fftSize / 2 / curve.hop - 1
  for (let beat = 1; beat <= START_CHECK_BEATS; beat += 1) {
    const centre = Math.round(beat * (60 / bpm) * framesPerSecond + lag)
    let found = false
    for (let frame = centre - START_CHECK_FRAMES; frame <= centre + START_CHECK_FRAMES; frame += 1) {
      if (frame > 0 && frame < curve.strength.length && isStrong(curve.strength[frame]!, threshold)) found = true
    }
    if (!found) return false
  }
  return true
}

/**
 * Time of the first beat in seconds, never before 0, or null when the curve has none.
 *
 * On a fitted tempo it is a beat of the fitted grid: the first one that a strong onset sits on
 * and that starts a run of beats on onsets (onPhaseStart), so noise or a count-in click before
 * the music, which sit off the grid's phase, never become marker 1, and every marker sits on the
 * grid the tempo was measured from. Otherwise, it is the first strong onset, or 0 when the file
 * opens on a beat of the grid at the reading (startsOnTheGrid).
 */
export function firstBeatOf(curve: OnsetCurve, tempo: GridTempo): number | null {
  if (curve.strength.length === 0) return null
  if (tempo.fitted) {
    const onPhase = onPhaseStart(curve, tempo)
    if (onPhase !== null) return onPhase
  }
  if (tempo.bpm > 0 && startsOnTheGrid(curve, tempo.bpm, strongThreshold(curve.strength))) return 0
  const frame = firstStrongFrame(curve.strength)
  return frame === null ? null : Math.max(0, frameTime(curve, frame))
}

/** The same from the samples, at the whole-number reading, in one go. */
export function firstBeatSeconds(samples: Float32Array, sampleRate: number, bpm: number): number | null {
  return firstBeatOf(onsetCurve(samples, sampleRate), { bpm, fitted: false })
}

/** Frames per slice: about 2 s of audio, a few tens of milliseconds of work on a phone. */
const SLICE_FRAMES = 200

/**
 * The onset curve a slice at a time, waiting on `pause` between slices so a long song never
 * blocks the page. `isCancelled` stops the work early, for a result the visitor has already left.
 */
export async function onsetCurveInSlices(
  samples: Float32Array,
  sampleRate: number,
  pause: () => Promise<void>,
  isCancelled: () => boolean = () => false,
): Promise<OnsetCurve | null> {
  const { curve, step } = onsetStepper(samples, sampleRate)
  while (!step(SLICE_FRAMES)) {
    await pause()
    if (isCancelled()) return null
  }
  return curve
}

// The exact tempo (RBA-128). The site's 5.x library reports whole BPM, and a grid at 128 on a
// 127.6 BPM song is half a second late after 3 minutes. fitTempo measures the beat period from
// the same onset curve: it finds the strong onsets near a grid within 1 BPM of the reading and
// fits beat number to onset time by least squares. In v6, fitTempo refines Reading.bpmExact
// instead of the whole number: it still gives the grid's phase for the first beat.

/** How far the fitted tempo may sit from the whole-number reading it refines. */
const FIT_RANGE_BPM = 1
/** An onset belongs to a predicted beat when it sits within this many seconds of it. */
const MATCH_SECONDS = 0.035
/** Seconds of audio the coarse search scores before the fit takes over. */
const COARSE_SECONDS = 30
/**
 * Strong onsets tried as the grid's starting point: the strongest of the first COARSE_SECONDS,
 * not the first few, which under a noise bed or after a count-in are not beats at all, and which
 * on live drums can be the off-beat hats (the kick on the first sample is invisible), whose grid
 * is as steady as the kicks' half a beat away.
 */
const ANCHOR_TRIES = 4
/** Fit passes: the horizon doubles from COARSE_SECONDS, which covers about 8 hours in 10. */
const MAX_FIT_PASSES = 12
/** A fit counts with at least this many beats on onsets, and this share of the beats it predicts. */
const MIN_FIT_BEATS = 16
const MIN_FIT_SHARE = 0.5

/**
 * The tempo the marker grid steps at, in beats per minute and unrounded. It is never shown:
 * people read the whole-number reading. Fitted when measured from the audio, with `phase`, the
 * time in seconds of one beat of the fitted grid; otherwise it is the reading, for lack of a
 * steady fit, and the grid's phase is unknown.
 */
export type GridTempo =
  | { bpm: number; fitted: true; phase: number }
  | { bpm: number; fitted: false }

interface Onset {
  time: number
  strength: number
}

/**
 * Local peaks of the curve at or above `bar` (strongThreshold by default), each placed between
 * frames by a parabola through three.
 */
function strongOnsets(curve: OnsetCurve, bar = strongThreshold(curve.strength)): Onset[] {
  const { strength } = curve
  const onsets: Onset[] = []
  for (let i = 1; i + 1 < strength.length; i += 1) {
    const [before, value, after] = [strength[i - 1]!, strength[i]!, strength[i + 1]!]
    if (!isStrong(value, bar) || value < before || value <= after) continue
    const bend = before - 2 * value + after
    const shift = bend < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (before - after)) / bend)) : 0
    onsets.push({ time: frameTime(curve, i + shift), strength: value })
  }
  return onsets
}

/** Index of the first onset at or after `time`. */
function firstAtOrAfter(onsets: Onset[], time: number): number {
  let low = 0
  let high = onsets.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (onsets[middle]!.time < time) low = middle + 1
    else high = middle
  }
  return low
}

/** The strongest onset within MATCH_SECONDS of `time`, or null. */
function onsetNear(onsets: Onset[], time: number): Onset | null {
  let best: Onset | null = null
  for (let i = firstAtOrAfter(onsets, time - MATCH_SECONDS); i < onsets.length && onsets[i]!.time <= time + MATCH_SECONDS; i += 1) {
    if (best === null || onsets[i]!.strength > best.strength) best = onsets[i]!
  }
  return best
}

interface Grid {
  /** Time of beat 0. */
  start: number
  period: number
}

/** Each beat of the grid up to `until` seconds that lands on an onset: its number and the onset. */
function matches(onsets: Onset[], grid: Grid, until: number): { beat: number; time: number }[] {
  const found: { beat: number; time: number }[] = []
  const beats = Math.floor((until - grid.start) / grid.period)
  for (let beat = 0; beat <= beats; beat += 1) {
    const onset = onsetNear(onsets, grid.start + beat * grid.period)
    if (onset !== null) found.push({ beat, time: onset.time })
  }
  return found
}

/** The least-squares line through (beat, time), or null under two distinct beats. */
function lineThrough(points: { beat: number; time: number }[]): Grid | null {
  if (points.length < 2) return null
  const meanBeat = points.reduce((sum, point) => sum + point.beat, 0) / points.length
  const meanTime = points.reduce((sum, point) => sum + point.time, 0) / points.length
  let covariance = 0
  let variance = 0
  for (const point of points) {
    covariance += (point.beat - meanBeat) * (point.time - meanTime)
    variance += (point.beat - meanBeat) ** 2
  }
  if (variance === 0) return null
  const period = covariance / variance
  return period > 0 ? { start: meanTime - period * meanBeat, period } : null
}

/**
 * The grid over COARSE_SECONDS that lands most beats on onsets, from each of the anchors
 * and every tempo within FIT_RANGE_BPM of the reading. The tempo step keeps a neighbour's drift
 * over that span under half the match window, so the best is never skipped.
 */
function coarseGrid(onsets: Onset[], wholeBpm: number): Grid | null {
  const step = (MATCH_SECONDS * wholeBpm) / (2 * COARSE_SECONDS)
  const steps = Math.ceil(FIT_RANGE_BPM / step)
  const opening = onsets.slice(0, firstAtOrAfter(onsets, (onsets[0]?.time ?? 0) + COARSE_SECONDS))
  const anchors = opening.sort((a, b) => b.strength - a.strength).slice(0, ANCHOR_TRIES)
  let best: { grid: Grid; score: number } | null = null
  for (const anchor of anchors) {
    for (let index = -steps; index <= steps; index += 1) {
      const grid = { start: anchor.time, period: 60 / (wholeBpm + (index * FIT_RANGE_BPM) / steps) }
      const score = matches(onsets, grid, anchor.time + COARSE_SECONDS).length
      if (best === null || score > best.score) best = { grid, score }
    }
  }
  return best?.grid ?? null
}

/**
 * The exact tempo of a steady song from its onset curve, within FIT_RANGE_BPM of `wholeBpm`, the
 * library's whole-number reading. It falls back to `wholeBpm` (fitted: false) when too few beats
 * land on onsets: an unsteady song, a sparse or very short file, or a tempo outside the range.
 */
export function fitTempo(curve: OnsetCurve, wholeBpm: number): GridTempo {
  const fallback: GridTempo = { bpm: wholeBpm, fitted: false }
  if (!(wholeBpm > FIT_RANGE_BPM)) return fallback
  const threshold = strongThreshold(curve.strength)
  const onsets = strongOnsets(curve, threshold)
  const end = frameTime(curve, curve.strength.length - 1)
  let grid = coarseGrid(onsets, wholeBpm)
  if (grid === null) return fallback
  // Fit over a horizon that doubles each pass: the line from the shorter span predicts the
  // beats of the longer one well within the match window, so no beat is matched to its neighbour.
  let horizon = COARSE_SECONDS
  for (let pass = 0; pass < MAX_FIT_PASSES; pass += 1) {
    const points = matches(onsets, grid, Math.min(end, grid.start + horizon))
    const line = lineThrough(points)
    if (line === null) return fallback
    grid = line
    if (grid.start + horizon >= end) break
    horizon *= 2
  }
  const whole = fromTheStart(grid)
  const bpm = 60 / grid.period
  if (!isSteady(onsets, whole, end) || Math.abs(bpm - wholeBpm) > FIT_RANGE_BPM) return fallback
  const opensOnOnset = isStrong(curve.startStrength, threshold)
  return { bpm, fitted: true, phase: onTheBeat(onsets, whole, end, opensOnOnset).start }
}

/**
 * The grid of beats, of `grid` and the one half a beat away, when both are steady: kicks with
 * off-beat hats as loud (open hats in house music) land as many beats either way, and the fit
 * keeps whichever its strongest anchor was on. The beats are the train that starts first, as a
 * song almost always opens on a beat; a file that rises strongly from its first sample starts a
 * train at 0. A song that opens on an off-beat pickup puts its markers half a beat out.
 */
function onTheBeat(onsets: Onset[], grid: Grid, end: number, opensOnOnset: boolean): Grid {
  const shifted = fromTheStart({ start: grid.start + grid.period / 2, period: grid.period })
  if (!isSteady(onsets, shifted, end)) return grid
  const startOf = (train: Grid) => {
    const nearZero = train.start <= MATCH_SECONDS || train.period - train.start <= MATCH_SECONDS
    return opensOnOnset && nearZero ? 0 : (matches(onsets, train, end)[0]?.time ?? Infinity)
  }
  return startOf(shifted) < startOf(grid) ? shifted : grid
}

/** The same grid from its first beat at or after 0 s, so a share counts over the whole file. */
function fromTheStart(grid: Grid): Grid {
  return { start: grid.start - Math.floor(grid.start / grid.period) * grid.period, period: grid.period }
}

/** Whether enough of the grid's beats over the file land on onsets (MIN_FIT_BEATS, MIN_FIT_SHARE). */
function isSteady(onsets: Onset[], grid: Grid, end: number): boolean {
  const found = matches(onsets, grid, end).length
  const predicted = Math.floor((end - grid.start) / grid.period) + 1
  return found >= MIN_FIT_BEATS && found >= MIN_FIT_SHARE * predicted
}

/**
 * Beats of a fitted grid after a candidate first beat that must land on strong onsets for it to
 * count, as in startsOnTheGrid. The match window is the fit's own (MATCH_SECONDS), wide enough
 * for a live drummer's few milliseconds either side, where the reading's one-frame check is not.
 */
const PHASE_CHECK_BEATS = 4
/**
 * The share of the strong bar a first beat itself needs, when the run after it clears the full
 * bar. A first beat out of a loud noise bed reads weaker than the beats after it, because the
 * curve's loudness jumps in that same frame; noise on the grid's phase rarely starts a run.
 */
const FIRST_BEAT_FRACTION = 0.5

/**
 * The first beat of the fitted grid that an onset sits on (at FIRST_BEAT_FRACTION of the strong
 * bar) and that starts a run of PHASE_CHECK_BEATS more beats on strong onsets, or null when none
 * does. A beat at 0 counts when the file rises strongly from its first sample there. The result is the grid's own time for that beat, not the onset's, so
 * one early or late hit doesn't shift every marker; a beat a few milliseconds before 0 reads 0.
 */
function onPhaseStart(curve: OnsetCurve, tempo: GridTempo & { fitted: true }): number | null {
  const period = 60 / tempo.bpm
  const threshold = strongThreshold(curve.strength)
  const onsets = strongOnsets(curve, threshold)
  const beatNear = (time: number) => tempo.phase + Math.round((time - tempo.phase) / period) * period
  const startsRun = (beat: number) => {
    for (let next = 1; next <= PHASE_CHECK_BEATS; next += 1) {
      if (onsetNear(onsets, beat + next * period) === null) return false
    }
    return true
  }
  const atZero = beatNear(0)
  if (isStrong(curve.startStrength, threshold) && Math.abs(atZero) <= MATCH_SECONDS && startsRun(atZero)) {
    return Math.max(0, atZero)
  }
  for (const onset of strongOnsets(curve, FIRST_BEAT_FRACTION * threshold)) {
    const beat = beatNear(onset.time)
    if (Math.abs(onset.time - beat) <= MATCH_SECONDS && startsRun(beat)) return Math.max(0, beat)
  }
  return null
}
