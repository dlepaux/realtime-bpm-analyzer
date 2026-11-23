// What the home's mic panel tells a listener besides the tempo (RBA-275): that the input is too
// quiet, that a reading isn't coming and tapping along is an option, and where the session
// stood when it stopped. Many phone mic sessions stop without a lock, and a quiet room showed a
// confident-looking number for 30 s with no word about the level.
//
// Pure data and functions, so node --test reads them; useMicGuard does the listening.

/**
 * Below this RMS level the input counts as too quiet. Music played near a phone reads well
 * above it; a quiet room's hiss reads below. Set by reasoning, not on real phones yet: the hint
 * only adds a line and never hides a reading, so a threshold that is off costs a wrong hint at
 * worst, and `too_quiet` on bpm_mic_stopped measures how often it shows.
 */
export const QUIET_DBFS = -50
/** How long the level must stay low before the hint shows, so a quiet break in a song doesn't trip it. */
export const QUIET_AFTER_MS = 3000
/** With no lock by then, tapping along is offered. A clean song locks in about 13 s on the live site. */
export const TAP_OFFER_AFTER_MS = 15_000
/** How often the level is read: fast enough for a 3 s window, slow enough to cost nothing. */
export const LEVEL_POLL_MS = 250

/** Where a mic session stands, as bpm_mic_stopped reports it. */
export const MIC_PHASES = ['listening', 'settling', 'locked', 'paused', 'error'] as const
export type MicPhase = (typeof MIC_PHASES)[number]

/** RMS level of a block of samples in dBFS; -Infinity for digital silence or an empty block. */
export function rmsDbfs(samples: ArrayLike<number>): number {
  if (samples.length === 0) return Number.NEGATIVE_INFINITY
  let sum = 0
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i] ?? 0
    sum += sample * sample
  }
  const rms = Math.sqrt(sum / samples.length)
  return rms > 0 ? 20 * Math.log10(rms) : Number.NEGATIVE_INFINITY
}

/**
 * When the current quiet stretch began: kept while the level stays low, cleared as soon as it
 * rises. A NaN level (a broken read) counts as not quiet, so it never raises the hint.
 */
export function nextQuietSince(quietSince: number | null, levelDb: number, now: number): number | null {
  if (!(levelDb < QUIET_DBFS)) return null
  return quietSince ?? now
}

export function isTooQuiet(quietSince: number | null, now: number): boolean {
  return quietSince !== null && now - quietSince >= QUIET_AFTER_MS
}

/** Offer tapping along once a session has listened long enough without ever locking. */
export function offersTapAlong(startedAt: number, now: number, everLocked: boolean): boolean {
  return !everLocked && now - startedAt >= TAP_OFFER_AFTER_MS
}

export const MIC_LISTENING_LINE = 'Listening to your microphone'
/** Under a result kept after its session ended, so it doesn't claim to be listening. */
export const MIC_STOPPED_LINE = 'Microphone off'

/**
 * The line under the number, by priority: an interruption first, since nothing else works until
 * it's resumed, then a quiet input, then the default.
 */
export function micStatusLine(state: { paused: boolean; tooQuiet: boolean }): string {
  if (state.paused) return 'Paused: the microphone was interrupted'
  if (state.tooQuiet) return 'Too quiet: hold your device closer to the music'
  return MIC_LISTENING_LINE
}
