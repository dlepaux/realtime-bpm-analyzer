// Pure tempo math behind the tap tempo, BPM-to-ms and metronome pages.
// No Vue and no DOM, so `npm test` runs it with plain `node --test`
// (scripts/tempo.test.ts). Keep it that way: no imports.

export const MIN_BPM = 20
export const MAX_BPM = 300

/** A gap longer than one beat at MIN_BPM can only mean the user started over. */
export const TAP_TIMEOUT_MS = 60_000 / MIN_BPM

/** Sliding window: long enough to average out jitter, short enough to follow a tempo change. */
export const MAX_TAPS = 16

export function clampBpm(bpm: number): number {
  return Math.min(MAX_BPM, Math.max(MIN_BPM, bpm))
}

/** Reads a `?bpm=` value handed over from another tool page. */
export function parseBpmParam(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null
  const bpm = Number(raw)
  if (!Number.isFinite(bpm)) return null
  return clampBpm(Math.round(bpm * 100) / 100)
}

/** Appends a tap, starting a new sequence after a pause and keeping the last MAX_TAPS. */
export function pushTap(times: readonly number[], now: number): number[] {
  const last = times[times.length - 1]
  if (last === undefined || now - last > TAP_TIMEOUT_MS || now <= last) return [now]
  return [...times, now].slice(-MAX_TAPS)
}

export interface TapEstimate {
  bpm: number
  /** Spread of the tap intervals as a fraction of the mean interval (0.02 = ±2%). */
  jitter: number
}

/**
 * Least-squares slope of tap time against tap index. Every tap pulls on the
 * estimate, so one late tap moves it far less than averaging the last interval.
 */
export function estimateTapTempo(times: readonly number[]): TapEstimate | null {
  const n = times.length
  if (n < 2) return null

  const meanIndex = (n - 1) / 2
  const meanTime = times.reduce((sum, t) => sum + t, 0) / n
  let covariance = 0
  let variance = 0
  times.forEach((t, i) => {
    covariance += (i - meanIndex) * (t - meanTime)
    variance += (i - meanIndex) ** 2
  })
  const msPerBeat = covariance / variance
  if (!(msPerBeat > 0)) return null

  const intervals = tapIntervals(times)
  const meanInterval = intervals.reduce((sum, v) => sum + v, 0) / intervals.length
  const spread = Math.sqrt(intervals.reduce((sum, v) => sum + (v - meanInterval) ** 2, 0) / intervals.length)
  return { bpm: 60_000 / msPerBeat, jitter: spread / meanInterval }
}

export function tapIntervals(times: readonly number[]): number[] {
  return times.slice(1).map((t, i) => t - (times[i] as number))
}

export type NoteFeel = 'straight' | 'dotted' | 'triplet'

/** 1 = whole note, 4 = quarter note, 64 = sixty-fourth note. */
export const NOTE_DIVISIONS = [1, 2, 4, 8, 16, 32, 64] as const
export type NoteDivision = (typeof NOTE_DIVISIONS)[number]

const FEEL_FACTOR: Record<NoteFeel, number> = { straight: 1, dotted: 1.5, triplet: 2 / 3 }

/** Duration of one note in milliseconds; the beat is a quarter note. */
export function noteMs(bpm: number, division: NoteDivision, feel: NoteFeel = 'straight'): number {
  return (60_000 / bpm) * (4 / division) * FEEL_FACTOR[feel]
}

/** Inverse of noteMs: the tempo at which one such note lasts `ms`. */
export function msToBpm(ms: number, division: NoteDivision = 4, feel: NoteFeel = 'straight'): number {
  return (60_000 * (4 / division) * FEEL_FACTOR[feel]) / ms
}

export function msToHz(ms: number): number {
  return 1000 / ms
}

// Upper bounds are exclusive. Sources disagree by a few BPM at each edge;
// these follow the common modern metronome markings.
const MARKINGS: ReadonlyArray<readonly [number, string]> = [
  [40, 'Grave'],
  [60, 'Largo'],
  [66, 'Larghetto'],
  [76, 'Adagio'],
  [108, 'Andante'],
  [120, 'Moderato'],
  [156, 'Allegro'],
  [176, 'Vivace'],
  [200, 'Presto'],
  [Infinity, 'Prestissimo'],
]

export function tempoMarking(bpm: number): string {
  return (MARKINGS.find(([upper]) => bpm < upper) ?? MARKINGS[MARKINGS.length - 1]!)[1]
}

export type ClickKind = 'accent' | 'beat' | 'sub'

/** What the metronome plays on a tick, where a tick is one subdivision of a beat. */
export function clickKind(tick: number, beatsPerBar: number, subdivision: number): ClickKind {
  if (tick % subdivision !== 0) return 'sub'
  return Math.floor(tick / subdivision) % beatsPerBar === 0 ? 'accent' : 'beat'
}
