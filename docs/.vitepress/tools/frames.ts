// Pure frame math behind the BPM to frames page. No Vue and no DOM, so `npm test`
// runs it with plain `node --test` (scripts/frames.test.ts). Keep it that way: no imports.

export interface FrameRate {
  /** Exact frames per second. The NTSC rates are fractions, not their rounded labels. */
  fps: number
  /** How editors name the rate. */
  label: string
}

// 23.976 is 24000/1001, not 23.976: over a three-minute song the rounded value is off
// by about a frame, which is exactly the error an editor cutting on the beat would see.
export const FRAME_RATES: readonly FrameRate[] = [
  { fps: 24_000 / 1001, label: '23.976' },
  { fps: 24, label: '24' },
  { fps: 25, label: '25' },
  { fps: 30_000 / 1001, label: '29.97' },
  { fps: 30, label: '30' },
  { fps: 50, label: '50' },
  { fps: 60_000 / 1001, label: '59.94' },
  { fps: 60, label: '60' },
]

export const MIN_FPS = 1
export const MAX_FPS = 240
export const MIN_BEATS_PER_BAR = 1
export const MAX_BEATS_PER_BAR = 16

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

/** True when the count is whole to within float noise, so there is no drift to show. */
export function isWholeFrames(frames: number): boolean {
  return Math.abs(frames - Math.round(frames)) < 1e-6
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
  return fps
}
