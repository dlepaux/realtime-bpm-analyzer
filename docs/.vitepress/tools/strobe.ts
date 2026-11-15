// The strobe light's decisions (RBA-237): when a flash may show, how it looks, and when it stops.
// The page flashes, so its safety rules follow WCAG 2.3.1, Three Flashes or Below Threshold, and
// they live here, where node --test checks them (scripts/strobe.test.ts) without a browser. The
// component only draws what step() returns. Pure: no Vue, no DOM, and only tempo.ts imported.

import { ticksBefore, type TickCursor } from './tempo.ts'

/** WCAG 2.3.1: no more than three flashes in any one-second period. */
export const MAX_FLASHES_PER_WINDOW = 3
export const FLASH_WINDOW_MS = 1000

/** Up to 180 BPM every beat fits under the cap (3 a second); above it, every second beat does. */
export const EVERY_OTHER_BEAT_ABOVE_BPM = 180

/**
 * A beat not shown this long after it falls is dropped, never shown late: a busy or stalled page
 * catches up by skipping beats, not by flashing them all at once. Covers a 30 Hz screen's frame.
 */
export const MAX_LATE_MS = 50

/**
 * The shortest gap between two flashes. A tap that moves the grid can put a beat right after the
 * last flash; within the three-a-second cap that would still read as a double flicker.
 */
export const MIN_GAP_MS = 250

export type FlashStyle = 'flash' | 'pulse'
export type FlashKind = 'accent' | 'beat'

/** Where the tempo comes from: typed in, tapped, or heard through the microphone. */
export const TEMPO_SOURCES = ['typed', 'tapped', 'mic'] as const
export type TempoSource = (typeof TEMPO_SOURCES)[number]

export function beatsPerFlash(bpm: number): 1 | 2 {
  return bpm > EVERY_OTHER_BEAT_ABOVE_BPM ? 2 : 1
}

/** Under prefers-reduced-motion the soft pulse is the default; the full flash is an opt-in. */
export function initialStyle(reducedMotion: boolean): FlashStyle {
  return reducedMotion ? 'pulse' : 'flash'
}

/** May a flash start at `now`, given when the last ones started (oldest first)? */
export function mayFlash(shown: readonly number[], now: number): boolean {
  const last = shown[shown.length - 1]
  if (last !== undefined && now - last < MIN_GAP_MS) return false
  return shown.filter((at) => now - at < FLASH_WINDOW_MS).length < MAX_FLASHES_PER_WINDOW
}

// ── Colours ─────────────────────────────────────────────────────────────────────────────────

/**
 * White on the downbeat, the brand's light blue on the other beats, on a black stage. Neither is
 * near red: WCAG's red flash threshold is stricter than the general one, so red is never used.
 */
export const FLASH_COLORS: Readonly<Record<FlashKind, string>> = Object.freeze({ accent: '#ffffff', beat: '#8fa8ff' })
export const STAGE_COLOR = '#000000'

const toLinear = (channel: number) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)

/**
 * WCAG's saturated red: R / (R + G + B) of 0.8 or more. Checked in sRGB and in linear light,
 * since readings of the definition differ and linear light is the stricter one for a red.
 */
export function isSaturatedRed(hex: string): boolean {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!match) throw new RangeError(`isSaturatedRed: expected #rrggbb, got ${hex}`)
  const srgb = match.slice(1, 4).map((part) => Number.parseInt(part, 16) / 255) as [number, number, number]
  const ratio = ([r, g, b]: readonly number[]) => ((r as number) + (g as number) + (b as number) === 0 ? 0 : (r as number) / ((r as number) + (g as number) + (b as number)))
  return ratio(srgb) >= 0.8 || ratio(srgb.map(toLinear)) >= 0.8
}

export type FlashAnimation = { color: string; peakOpacity: number; attackMs: number; decayMs: number }

/**
 * How one flash looks. The full flash is on at once and gone within 120 ms. The soft pulse rises
 * gently to a third of the light and fades, for the reduced-motion default. Both end well before
 * the next flash can start (`intervalMs`, at least MIN_GAP_MS), so the stage is dark between.
 */
export function flashAnimation(style: FlashStyle, kind: FlashKind, intervalMs: number): FlashAnimation {
  const color = FLASH_COLORS[kind]
  if (style === 'flash') return { color, peakOpacity: 1, attackMs: 0, decayMs: Math.min(120, intervalMs * 0.4) }
  const span = Math.min(600, intervalMs * 0.7)
  return { color, peakOpacity: kind === 'accent' ? 0.35 : 0.25, attackMs: Math.round(span * 0.3), decayMs: Math.round(span * 0.7) }
}

// ── The running state ───────────────────────────────────────────────────────────────────────

export type Strobe = {
  readonly running: boolean
  /** The next beat on the grid, in ms on the page's clock. null until there is a tempo. */
  readonly cursor: TickCursor | null
  /** The newest beat due but not shown yet, held back by the cap for at most MAX_LATE_MS. */
  readonly pending: TickCursor | null
  /** When the recent flashes started, oldest first. */
  readonly shown: readonly number[]
}

/** Stopped. The only way out is start(), which only the Start button calls. */
export const IDLE: Strobe = Object.freeze({ running: false, cursor: null, pending: null, shown: Object.freeze([]) })

export function start(): Strobe {
  return { running: true, cursor: null, pending: null, shown: [] }
}

export function stop(): Strobe {
  return IDLE
}

export type StepInput = {
  /** The frame's time, ms, on the clock the taps use. */
  readonly now: number
  /** The tempo now, or null while the microphone has none. */
  readonly bpm: number | null
  readonly beatsPerBar: number
}

/**
 * One frame: moves the grid on to `now` and says whether a flash starts on this frame. A beat
 * that the cap holds back waits a few ms for its turn; one that can't show in MAX_LATE_MS is
 * dropped. Every second beat flashes above EVERY_OTHER_BEAT_ABOVE_BPM.
 */
export function step(state: Strobe, { now, bpm, beatsPerBar }: StepInput): { state: Strobe; flash: FlashKind | null } {
  if (!state.running || bpm === null || !(bpm > 0)) return { state, flash: null }
  const period = 60_000 / bpm
  const cursor = skipMissed(state.cursor ?? { tick: 0, time: now }, now, period)
  const { due, next } = ticksBefore(cursor, now, period)
  const every = beatsPerFlash(bpm)
  const latest = due.filter((beat) => beat.tick % every === 0).pop()
  const candidate = latest ?? state.pending
  const pending = candidate && now - candidate.time <= MAX_LATE_MS ? candidate : null

  if (!pending || !mayFlash(state.shown, now)) return { state: { ...state, cursor: next, pending }, flash: null }
  const shown = [...state.shown, now].filter((at) => now - at < FLASH_WINDOW_MS).slice(-MAX_FLASHES_PER_WINDOW)
  const flash: FlashKind = pending.tick % Math.max(1, beatsPerBar) === 0 ? 'accent' : 'beat'
  return { state: { ...state, cursor: next, pending: null, shown }, flash }
}

/** Jumps a grid left far behind (a stalled page) to its last beat before `now`, in one step. */
function skipMissed(cursor: TickCursor, now: number, period: number): TickCursor {
  const behind = Math.floor((now - cursor.time) / period)
  if (behind < 2) return cursor
  return { tick: cursor.tick + behind, time: cursor.time + behind * period }
}

/**
 * A tap says a beat falls at `at`: `beat` is its place in the bar, 0 for the downbeat. The grid
 * moves so the next beat falls one period later. A beat held back from the old grid is dropped,
 * and the cap still applies, so a tap can't add a flash. Taps while stopped change nothing.
 */
export function alignToTap(state: Strobe, at: number, periodMs: number, beat: number): Strobe {
  if (!state.running || !(periodMs > 0)) return state
  return { ...state, cursor: { tick: beat + 1, time: at + periodMs }, pending: null }
}
