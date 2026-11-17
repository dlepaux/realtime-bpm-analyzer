// Pure frame math behind the BPM to frames page. No Vue and no DOM, so `npm test`
// runs it with plain `node --test` (scripts/frames.test.ts). Keep it that way: no imports.

/**
 * A count as an exact fraction. Whether a count ends within 6 decimals is decided on these
 * integers: a float can't tell 81.000081000081… (a repeating NTSC count) from 81.000081.
 */
export interface Fraction {
  readonly num: bigint
  /** Always above 0. */
  readonly den: bigint
}

export interface FrameRate {
  /** Frames per second as a float, for the drift in milliseconds. */
  fps: number
  /** How editors name the rate. */
  label: string
  /** The same rate exactly: 24000/1001 for 23.976, not its rounded label. */
  exact: Fraction
}

function rate(num: number, den: number, label: string): FrameRate {
  return { fps: num / den, label, exact: { num: BigInt(num), den: BigInt(den) } }
}

// 23.976 is 24000/1001, not 23.976. The rounded value is close (about 0.004 frames off over
// three minutes), but the editors define the rate as the fraction, so the counts shown here are
// the ones the editor computes, and the marker export (beat-markers.ts) uses the same fractions.
export const FRAME_RATES: readonly FrameRate[] = [
  rate(24_000, 1001, '23.976'),
  rate(24, 1, '24'),
  rate(25, 1, '25'),
  rate(30_000, 1001, '29.97'),
  rate(30, 1, '30'),
  rate(50, 1, '50'),
  rate(60_000, 1001, '59.94'),
  rate(60, 1, '60'),
]

export const MIN_FPS = 1
export const MAX_FPS = 240
export const MIN_BEATS_PER_BAR = 1
export const MAX_BEATS_PER_BAR = 16
/** A typed rate this close to a preset is that preset. */
export const PRESET_TOLERANCE = 1e-3

/** Frames in one beat. Fractional when the beat doesn't land on a frame boundary. */
export function framesPerBeat(bpm: number, fps: number): number {
  return (fps * 60) / bpm
}

/** Frames in `beats` beats, for a bar or any other count of beats. */
export function framesPerBeats(bpm: number, fps: number, beats: number): number {
  return framesPerBeat(bpm, fps) * beats
}

/**
 * How far a cut lands from the beat when the editor cuts every whole `rounded` frames
 * instead of the exact count, per repetition. Positive means the cuts fall late.
 */
export interface Drift {
  /** The whole frame count an editor would use. */
  rounded: number
  /** Frames gained or lost each time. */
  frames: number
  /** The same drift in milliseconds. */
  ms: number
}

export function roundingDrift(exactFrames: number, fps: number): Drift {
  const rounded = Math.max(1, Math.round(exactFrames))
  const frames = rounded - exactFrames
  return { rounded, frames, ms: (frames / fps) * 1000 }
}

/**
 * A typed number as the exact decimal it shows, so 47.952 is 47952/1000. String() gives the
 * shortest digits that read back as the same float, which are the digits the user typed.
 */
export function decimalFraction(value: number): Fraction {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`not a count: ${value}`)
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(String(value))
  if (!match) throw new RangeError(`not a decimal: ${value}`)
  const [, whole, decimals = '', exponent = '0'] = match
  const shift = Number(exponent) - decimals.length
  const digits = BigInt(`${whole}${decimals}`)
  return shift >= 0
    ? { num: digits * 10n ** BigInt(shift), den: 1n }
    : { num: digits, den: 10n ** BigInt(-shift) }
}

/** Frames in `beats` beats, exactly: fps × 60 × beats / bpm, with the tempo as typed. */
export function framesFraction(bpm: number, fps: Fraction, beats: number): Fraction {
  if (!Number.isInteger(beats) || beats < 1) throw new RangeError(`not a beat count: ${beats}`)
  const tempo = decimalFraction(bpm)
  if (tempo.num === 0n) throw new RangeError('a tempo of 0 has no beats')
  return reduced(fps.num * 60n * BigInt(beats) * tempo.den, fps.den * tempo.num)
}

/** Bounded: Euclid's steps grow with the digits, at most a few dozen here. */
function gcd(a: bigint, b: bigint): bigint {
  let [x, y] = [a, b]
  while (y !== 0n) [x, y] = [y, x % y]
  return x
}

function reduced(num: bigint, den: bigint): Fraction {
  const divisor = gcd(num, den)
  return { num: num / divisor, den: den / divisor }
}

/** True when the count lands on a frame boundary, so there is no drift to show. */
export function isWhole(frames: Fraction): boolean {
  return frames.num % frames.den === 0n
}

/** Half up, as Math.round does for these positive counts. */
function roundHalfUp(num: bigint, den: bigint): bigint {
  return (2n * num + den) / (2n * den)
}

/** How far the whole count roundingDrift() cuts on is from the exact count, as a size. */
export function driftFraction(frames: Fraction): Fraction {
  const rounded = roundHalfUp(frames.num, frames.den)
  const cut = rounded < 1n ? 1n : rounded
  const gap = cut * frames.den - frames.num
  return { num: gap < 0n ? -gap : gap, den: frames.den }
}

/** Decimals a frame count may show in full: 1500 / 128 = 11.71875 needs 5. */
const FULL_DECIMALS = 6n
/** Decimals for a count that never ends, the NTSC rates and thirds. */
const SHORT_DECIMALS = 3n

/** `scaled` / 10^decimals written out, without trailing zeros. */
function decimalString(scaled: bigint, decimals: bigint): string {
  const unit = 10n ** decimals
  const fraction = (scaled % unit).toString().padStart(Number(decimals), '0').replace(/0+$/, '')
  const whole = (scaled / unit).toString()
  return fraction === '' ? whole : `${whole}.${fraction}`
}

/**
 * A frame count as the page shows and copies it: in full when it ends within 6 decimals, so an
 * editor gets the exact 11.71875 and not 11.719, otherwise rounded to 3 decimals.
 */
export function formatFrames(frames: Fraction): string {
  if (frames.num < 0n || frames.den <= 0n) throw new RangeError('not a frame count')
  const full = frames.num * 10n ** FULL_DECIMALS
  if (full % frames.den === 0n) return decimalString(full / frames.den, FULL_DECIMALS)
  return decimalString(roundHalfUp(frames.num * 10n ** SHORT_DECIMALS, frames.den), SHORT_DECIMALS)
}

/**
 * Reads a custom frame rate typed by the user. Accepts the editors' labels, so "29.97"
 * becomes 30000/1001, and refuses anything outside MIN_FPS to MAX_FPS.
 */
export function parseFps(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const known = FRAME_RATES.find((rate) => rate.label === trimmed)
  if (known) return known.fps
  const fps = Number(trimmed)
  if (!Number.isFinite(fps) || fps < MIN_FPS || fps > MAX_FPS) return null
  // "29.970" or "23.9760" is a preset written another way: return the preset's exact fps,
  // so the page doesn't add it again as a custom row (RBA-124).
  const near = FRAME_RATES.find((rate) => Math.abs(rate.fps - fps) < PRESET_TOLERANCE)
  return near ? near.fps : fps
}
