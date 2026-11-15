// The strobe light's decisions (RBA-237): when a flash may show, how it looks, and when it stops.
// The page flashes, so its safety rules follow WCAG 2.3.1, Three Flashes or Below Threshold, and
// they live here, where node --test checks them (scripts/strobe.test.ts) without a browser. The
// component only draws what step() returns. Pure: no Vue, no DOM, and only tempo.ts imported.

import { ticksBefore, type TickCursor } from './tempo.ts'

/** WCAG 2.3.1: no more than three flashes in any one-second period. */
export const MAX_FLASHES_PER_WINDOW = 3
export const FLASH_WINDOW_MS = 1000

/**
 * The cap is held with room to spare: any four onsets span at least FLASH_WINDOW_MS plus this.
 * The onsets are decided on rAF's frame clock, and each is painted on a later frame, so the
 * painted flashes can sit closer than the decided ones by the spread in that delay. On a 30 Hz
 * screen, the slowest the tests use, a paint one frame late is 33 ms, and a dropped frame doubles
 * it; 100 ms covers three such frames plus timer jitter. RUNNER-RBA-240 measured the painted span
 * 1 ms under the decided one at 60 Hz, where dc3f56a held the cap at exactly 1000 ms.
 */
export const CAP_MARGIN_MS = 100

/** The window the cap is counted in: WCAG's one second, plus the margin. */
export const GUARDED_WINDOW_MS = FLASH_WINDOW_MS + CAP_MARGIN_MS

/**
 * Up to 150 BPM every beat flashes; above it, every second beat. At 150 BPM four beats span
 * 1200 ms: the guarded window plus 100 ms, which absorbs a beat shown up to one frame late (and
 * a held-back beat's MAX_LATE_MS wait) at 30 Hz, so a steady tempo never loses a flash to the
 * margin. At 160 the slack would be 25 ms, under one 30 Hz frame, and the sweep in
 * strobe.test.ts drops a beat at 30 Hz there; 150 stays clear of that by a round number.
 */
export const EVERY_OTHER_BEAT_ABOVE_BPM = 150

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

/**
 * How long after a stop a click can't start it again. A tap on the light stops it and uncovers
 * the Start button under the finger, and the browser's click from that tap lands there; a held
 * Enter repeats onto Start once focus returns to it. Both would restart it by themselves.
 */
export const RESTART_GUARD_MS = 500

/** Is a click at `at` too close to the last stop (null: never stopped) to count as a start? */
export function isTooSoonAfterStop(stoppedAt: number | null, at: number): boolean {
  return stoppedAt !== null && at - stoppedAt < RESTART_GUARD_MS
}

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

/**
 * May a flash start at `now`, given when the last ones started (oldest first)? At most three in
 * any GUARDED_WINDOW_MS, so a fourth comes at least 1100 ms after the first.
 */
export function mayFlash(shown: readonly number[], now: number): boolean {
  const last = shown[shown.length - 1]
  if (last !== undefined && now - last < MIN_GAP_MS) return false
  return shown.filter((at) => now - at < GUARDED_WINDOW_MS).length < MAX_FLASHES_PER_WINDOW
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
  const [r, g, b] = [match[1], match[2], match[3]].map((part) => Number.parseInt(part ?? '', 16) / 255) as [number, number, number]
  const ratio = (red: number, green: number, blue: number) => (red + green + blue === 0 ? 0 : red / (red + green + blue))
  return ratio(r, g, b) >= 0.8 || ratio(toLinear(r), toLinear(g), toLinear(b)) >= 0.8
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
  /** The beat interval the cursor was set with, so a tempo change re-times the next beat. */
  readonly period: number | null
  /** The newest beat due but not shown yet, held back by the cap for at most MAX_LATE_MS. */
  readonly pending: TickCursor | null
  /** When the recent flashes started, oldest first. Kept across a stop, see start(). */
  readonly shown: readonly number[]
}

/** Stopped. The only way out is start(), which only the Start button calls. */
export const IDLE: Strobe = Object.freeze({ running: false, cursor: null, period: null, pending: null, shown: Object.freeze([]) })

/**
 * Running, from a fresh grid. The flash history comes from the stopped state: a start flashes at
 * once, so without it stopping and starting fast (a held Enter, quick clicks) would add a flash
 * to every second.
 */
export function start(previous: Strobe = IDLE): Strobe {
  return { running: true, cursor: null, period: null, pending: null, shown: previous.shown }
}

/** Stopped from any state, keeping only when the last flashes were. */
export function stop(state: Strobe = IDLE): Strobe {
  return { ...IDLE, shown: state.shown }
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
  const cursor = skipMissed(retime(state, now, period), now, period)
  const { due, next } = ticksBefore(cursor, now, period)
  const every = beatsPerFlash(bpm)
  const latest = due.filter((beat) => beat.tick % every === 0).pop()
  const candidate = latest ?? state.pending
  const pending = candidate && now - candidate.time <= MAX_LATE_MS ? candidate : null

  if (!pending || !mayFlash(state.shown, now)) return { state: { ...state, cursor: next, period, pending }, flash: null }
  const shown = [...state.shown, now].filter((at) => now - at < GUARDED_WINDOW_MS).slice(-MAX_FLASHES_PER_WINDOW)
  const flash: FlashKind = pending.tick % Math.max(1, beatsPerBar) === 0 ? 'accent' : 'beat'
  return { state: { ...state, cursor: next, period, pending: null, shown }, flash }
}

/**
 * The cursor for this frame's tempo. A new tempo keeps the last beat where it was and puts the
 * next one a new period after it, so a jump from 20 to 120 BPM doesn't wait out the old beat.
 */
function retime(state: Strobe, now: number, period: number): TickCursor {
  if (!state.cursor) return { tick: 0, time: now }
  if (state.period === null || state.period === period) return state.cursor
  return { tick: state.cursor.tick, time: state.cursor.time - state.period + period }
}

/** Jumps a grid left far behind (a stalled page) to its last beat before `now`, in one step. */
function skipMissed(cursor: TickCursor, now: number, period: number): TickCursor {
  const behind = Math.floor((now - cursor.time) / period)
  if (behind < 2) return cursor
  return { tick: cursor.tick + behind, time: cursor.time + behind * period }
}

/**
 * A tap says a beat falls at `at`: `beat` is its place in the bar, 0 for the downbeat. The grid
 * moves so that beat is the tap itself, and it flashes on the next frame if the cap and the gap
 * allow; then the grid runs on a period apart. Putting the next beat a period after the tap
 * instead kept the light dark while a visitor tapped along: each tap came just before that beat
 * and moved it a period on again (RUNNER-RBA-240's browser check). A tap just after a flash is
 * the same beat: MIN_GAP_MS holds it back past MAX_LATE_MS, so it is dropped, not doubled. A beat
 * held back from the old grid is dropped. Taps while stopped change nothing.
 */
export function alignToTap(state: Strobe, at: number, periodMs: number, beat: number): Strobe {
  if (!state.running || !(periodMs > 0)) return state
  return { ...state, cursor: { tick: beat, time: at }, period: periodMs, pending: null }
}
