// The strobe light's decisions (RBA-237): when a flash may show, how it looks, and when it stops.
// The light flashes on the library's kick event (RBA-243). The page flashes, so its safety rules
// follow WCAG 2.3.1, Three Flashes or Below Threshold, and they live here, where node --test
// checks them against generated patterns of kicks (scripts/strobe.test.ts) without a browser. The
// component only feeds in kicks and frame times, and draws what step() returns. Pure: no Vue, no DOM.

/** WCAG 2.3.1: no more than three flashes in any one-second period. */
export const MAX_FLASHES_PER_WINDOW = 3
export const FLASH_WINDOW_MS = 1000

/**
 * The cap is held with room to spare: any four onsets span at least FLASH_WINDOW_MS plus this.
 * The onsets are decided on rAF's frame clock, and each is painted on a later frame, so the
 * painted flashes can sit closer than the decided ones by the spread in that delay. 100 ms is
 * three frames of a 30 Hz screen: a first flash painted up to three frames later than the fourth
 * still reads over 1 s. A cap held at exactly 1000 ms on the frame clock painted 4 flashes in
 * 999 ms in a browser (RBA-237, round 2).
 */
export const CAP_MARGIN_MS = 100

/** The window the cap is counted in: WCAG's one second, plus the margin. */
export const GUARDED_WINDOW_MS = FLASH_WINDOW_MS + CAP_MARGIN_MS

/**
 * Regular flashes keep at least this far apart: four of them then span 1200 ms, the guarded
 * window plus 100 ms for a kick's detection jitter and a frame of a 30 Hz screen, so a steady
 * beat never loses a flash to the cap.
 */
export const MIN_REGULAR_INTERVAL_MS = 400

/** Up to this tempo every kick flashes; above it, every second kick (MIN_REGULAR_INTERVAL_MS). */
export const EVERY_KICK_UP_TO_BPM = 60_000 / MIN_REGULAR_INTERVAL_MS

/**
 * Going back to fewer kicks per flash waits until the flashes would be this much over the
 * interval, so a tempo near the switch doesn't flip between every kick and every second kick.
 */
const SWITCH_BACK_ROOM = 1.04

/** The detector reports kicks at least 80 ms apart (RBA-243), so 5 kicks always make 400 ms. */
const MAX_KICKS_PER_FLASH = 8

/** How many recent kicks the tempo between them is read from: a median of the last 4 gaps. */
const KICK_HISTORY = 5

/** A gap this long is a breakdown, not a beat: the next kick starts a new count and flashes. */
export const BREAK_MS = 2000

/**
 * A kick not shown this long after its time is dropped, never shown late: a busy or stalled page
 * catches up by skipping kicks, not by flashing them all at once. Covers a 30 Hz screen's frame.
 */
export const MAX_LATE_MS = 50

/** The shortest gap between two flashes, so a roll of kicks never reads as a flicker. */
export const MIN_GAP_MS = 250

/** Kicks waiting for their time, at most: a page that adds more without stepping keeps the newest. */
const MAX_WAITING = 8

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

/**
 * A key held through a stop: Space or Esc stops the light and focus returns to Start, where the
 * key's repeats land. A button clicks on Space's release, so every repeat of Space and Enter is
 * refused there, and only a fresh press starts it.
 */
export function startKeyHeld(event: { key: string; repeat: boolean }): boolean {
  return event.repeat && (event.key === ' ' || event.key === 'Enter')
}

// ── Sources and timing ──────────────────────────────────────────────────────────────────────

/** Where the music comes from. Analytics counts the starts by these ids. */
export const STROBE_SOURCES = ['demo', 'file', 'mic', 'tab'] as const
export type StrobeSource = (typeof STROBE_SOURCES)[number]

/**
 * The demo and a file play through the page's AudioContext, so the listener hears a kick after
 * the analyzer does. The mic and a shared tab are already heard in the room when the kick arrives.
 */
export function playsInPage(source: StrobeSource): boolean {
  return source === 'demo' || source === 'file'
}

/** The AudioContext's clock, read with performance.now() at the same moment. */
export type AudioClock = { now: number; currentTime: number; baseLatency?: number; outputLatency?: number }

/**
 * When the listener hears a context time, in performance.now() ms: RBA-243's recipe. currentTime
 * is about where the analyzer is now, and the speakers play it baseLatency + outputLatency later.
 * getOutputTimestamp() isn't used: Firefox shifts both of its halves back by outputLatency.
 * Safari before 17 has no outputLatency, and a missing latency counts as none.
 */
export function heardAt(contextTime: number, clock: AudioClock): number {
  const latency = (clock.baseLatency || 0) + (clock.outputLatency || 0)
  return clock.now + (contextTime + latency - clock.currentTime) * 1000
}

/**
 * How long the demo and a song are held back on their way to the speakers, in ms; the analyzer
 * hears them at once. The library's kick event reaches the page 13 to 18 ms of audio time after
 * the kick (measured on RBA-237), and a busy main thread adds to that, so without the hold the
 * light would trail the sound. With it the event comes early, and the light waits for the kick to
 * be heard: measured, it lands within a frame. Generous for a slower device, and short enough that
 * Start still feels immediate.
 */
export const SPEAKER_DELAY_MS = 120

/**
 * Where a kick sits on the spectrogram's clock, in performance.now() ms: when its sound reaches
 * the analyser that paints it, the hold's output for the demo and a song, the input otherwise.
 * Earlier than `now` for the mic and a tab: the mark goes back to the kick's own time.
 */
export function markTimeFor(source: StrobeSource, contextTime: number, clock: AudioClock): number {
  const held = playsInPage(source) ? SPEAKER_DELAY_MS / 1000 : 0
  return clock.now + (contextTime + held - clock.currentTime) * 1000
}

/** When the light should show a kick: when it is heard from the page, at once if that has passed. */
export function flashTimeFor(source: StrobeSource, contextTime: number, clock: AudioClock): number {
  return playsInPage(source) ? Math.max(clock.now, heardAt(contextTime + SPEAKER_DELAY_MS / 1000, clock)) : clock.now
}

// ── The cap ─────────────────────────────────────────────────────────────────────────────────

export type FlashStyle = 'flash' | 'pulse'

/**
 * How many kicks per flash keep a steady beat's flashes MIN_REGULAR_INTERVAL_MS apart, given the
 * kicks' recent interval and the current count. More kicks per flash at once; fewer only with room.
 */
export function kicksPerFlash(intervalMs: number, current: number): number {
  if (!(intervalMs > 0)) return current
  const needed = Math.min(MAX_KICKS_PER_FLASH, Math.ceil(MIN_REGULAR_INTERVAL_MS / intervalMs))
  if (needed >= current) return needed
  return Math.min(current, Math.ceil((MIN_REGULAR_INTERVAL_MS * SWITCH_BACK_ROOM) / intervalMs))
}

/**
 * May a flash start at `now`, given when the last ones started (oldest first)? At most three in
 * any GUARDED_WINDOW_MS, so a fourth comes at least 1100 ms after the first, and MIN_GAP_MS apart.
 * This is the hard rule; kicksPerFlash only keeps a steady beat clear of it.
 */
export function mayFlash(shown: readonly number[], now: number): boolean {
  const last = shown[shown.length - 1]
  if (last !== undefined && now - last < MIN_GAP_MS) return false
  return shown.filter((at) => now - at < GUARDED_WINDOW_MS).length < MAX_FLASHES_PER_WINDOW
}

// ── Colours ─────────────────────────────────────────────────────────────────────────────────

/**
 * White for the full flash, the brand's light blue for the soft pulse, on a black stage. Neither
 * is near red: WCAG's red flash threshold is stricter than the general one, so red is never used.
 */
export const FLASH_COLORS: Readonly<Record<FlashStyle, string>> = Object.freeze({ flash: '#ffffff', pulse: '#8fa8ff' })
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

/** Under prefers-reduced-motion the soft pulse is the default; the full flash is an opt-in. */
export function initialStyle(reducedMotion: boolean): FlashStyle {
  return reducedMotion ? 'pulse' : 'flash'
}

export type FlashAnimation = { color: string; peakOpacity: number; attackMs: number; decayMs: number }

/**
 * How one flash looks. The kick's strength (0.5 to 1 in practice, RBA-243) sets its brightness,
 * so the light follows the music's dynamics. The full flash is on at once and gone within 120 ms.
 * The soft pulse rises gently to a third of the light and fades, for the reduced-motion default.
 * Both end before the next flash can start (`intervalMs`, at least MIN_GAP_MS): dark between.
 */
export function flashAnimation(style: FlashStyle, strength: number, intervalMs: number): FlashAnimation {
  const level = 0.6 + 0.4 * Math.min(1, Math.max(0, (strength - 0.5) * 2))
  const color = FLASH_COLORS[style]
  const interval = Math.max(MIN_GAP_MS, intervalMs)
  if (style === 'flash') return { color, peakOpacity: level, attackMs: 0, decayMs: Math.min(120, interval * 0.4) }
  const span = Math.min(600, interval * 0.7)
  return { color, peakOpacity: Math.round(0.35 * level * 100) / 100, attackMs: Math.round(span * 0.3), decayMs: Math.round(span * 0.6) }
}

// ── The running state ───────────────────────────────────────────────────────────────────────

/** A kick picked to flash, at the time the light should show it, with its strength. */
export type DueKick = { readonly at: number; readonly strength: number }

export type Strobe = {
  readonly running: boolean
  /** When the recent kicks fall, oldest first, for the interval between them. */
  readonly kicks: readonly number[]
  /** Kicks per flash: 1, or more above EVERY_KICK_UP_TO_BPM. */
  readonly every: number
  /** Kicks passed over since the last one picked, so every second kick stays regular. */
  readonly skipped: number
  /** Picked kicks waiting for their time, in order. */
  readonly due: readonly DueKick[]
  /** When the recent flashes started, oldest first. Kept across a stop, see start(). */
  readonly shown: readonly number[]
}

/** Stopped. The only way out is start(), which only the Start button calls. */
export const IDLE: Strobe = Object.freeze({
  running: false, kicks: Object.freeze([]), every: 1, skipped: 0, due: Object.freeze([]), shown: Object.freeze([]),
})

/**
 * Running, with a fresh count. The flash history comes from the stopped state: without it,
 * stopping and starting fast (a held Enter, quick clicks) could add a flash to every second.
 */
export function start(previous: Strobe = IDLE): Strobe {
  return { ...IDLE, running: true, shown: previous.shown }
}

/** Stopped from any state, keeping only when the last flashes were. */
export function stop(state: Strobe = IDLE): Strobe {
  return { ...IDLE, shown: state.shown }
}

const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = sorted.length >> 1
  return sorted.length % 2 ? (sorted[middle] as number) : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
}

/**
 * A kick, to show at `at` (see flashTimeFor). It counts toward the interval between kicks, and
 * it is picked to flash if it is the first after a break, or the `every`-th since the last one
 * picked. A kick at or before the last one is the same kick seen twice, and is ignored.
 */
export function addKick(state: Strobe, at: number, strength: number): Strobe {
  if (!state.running || !Number.isFinite(at)) return state
  const last = state.kicks[state.kicks.length - 1]
  if (last !== undefined && at <= last) return state
  const fresh = last === undefined || at - last > BREAK_MS
  const kicks = fresh ? [at] : [...state.kicks, at].slice(-KICK_HISTORY)
  const gaps = kicks.slice(1).map((time, i) => time - (kicks[i] as number))
  const every = gaps.length ? kicksPerFlash(median(gaps), state.every) : state.every
  const picked = fresh || state.skipped + 1 >= every
  if (!picked) return { ...state, kicks, every, skipped: state.skipped + 1 }
  const due = [...state.due, { at, strength }].slice(-MAX_WAITING)
  return { ...state, kicks, every, skipped: 0, due }
}

/** The flash a frame starts: its kick's strength, and the expected time to the next flash. */
export type Flash = { readonly strength: number; readonly intervalMs: number }

/**
 * One frame at `now`: says whether a flash starts on it. The newest kick whose time has come
 * flashes if the cap allows; one the cap holds back waits up to MAX_LATE_MS for its turn, then
 * is dropped, and older ones are dropped at once.
 */
export function step(state: Strobe, now: number): { state: Strobe; flash: Flash | null } {
  if (!state.running || state.due.length === 0) return { state, flash: null }
  const ready = state.due.filter((kick) => kick.at <= now)
  const latest = ready[ready.length - 1]
  if (!latest) return { state, flash: null }
  const waiting = state.due.slice(ready.length)
  if (now - latest.at > MAX_LATE_MS) return { state: { ...state, due: waiting }, flash: null }
  if (!mayFlash(state.shown, now)) return { state: { ...state, due: [latest, ...waiting] }, flash: null }
  const shown = [...state.shown, now].filter((at) => now - at < GUARDED_WINDOW_MS).slice(-MAX_FLASHES_PER_WINDOW)
  const gaps = state.kicks.slice(1).map((time, i) => time - (state.kicks[i] as number))
  const intervalMs = gaps.length ? median(gaps) * state.every : MIN_REGULAR_INTERVAL_MS
  return { state: { ...state, due: waiting, shown }, flash: { strength: latest.strength, intervalMs } }
}
