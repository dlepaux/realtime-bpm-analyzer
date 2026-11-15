// Run with `npm test`. The strobe light's safety rules (RBA-237, WCAG 2.3.1 Three Flashes or Below
// Threshold), tested where they are decided: tools/strobe.ts. The page only draws what step()
// returns, so these hold for every tempo source, tap and tempo change the page can produce.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CAP_MARGIN_MS,
  EVERY_OTHER_BEAT_ABOVE_BPM,
  FLASH_COLORS,
  FLASH_WINDOW_MS,
  IDLE,
  MAX_FLASHES_PER_WINDOW,
  MAX_LATE_MS,
  MIN_GAP_MS,
  RESTART_GUARD_MS,
  alignToTap,
  beatsPerFlash,
  flashAnimation,
  initialStyle,
  isSaturatedRed,
  isTooSoonAfterStop,
  mayFlash,
  start,
  step,
  stop,
  type FlashKind,
  type Strobe,
} from '../.vitepress/tools/strobe.ts'

/** A small seeded generator, so a failing run can be replayed. */
function random(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

/** A flash: decided on the frame at `at`, painted on the next frame, `paint`. */
type Flash = { at: number; kind: FlashKind; paint: number }

/**
 * The requirement the margin serves, written here rather than read from the module so the tests
 * state it on their own: any 4 consecutive onsets span at least this, by the frame clock, which
 * keeps the painted flashes under 3 in any second with room for a late frame (see CAP_MARGIN_MS).
 */
const FOUR_ONSETS_SPAN_MS = 1100
/** And painted, a frame later on a jittery screen, they still span this much: 1 s with room. */
const FOUR_PAINTS_SPAN_MS = 1050

type Run = {
  frames: number[]
  /** The tempo at a frame's time, or null while the microphone has none. */
  bpm: (at: number) => number | null
  beatsPerBar?: number
  /** Taps that line the grid up, with the beat each one marks (null: the nearest on the grid). */
  taps?: { at: number; beat: number | null }[]
}

function run({ frames, bpm, beatsPerBar = 4, taps = [] }: Run, from: Strobe = start()): { flashes: Flash[]; state: Strobe } {
  let state = from
  const flashes: Flash[] = []
  const pending = [...taps].sort((a, b) => a.at - b.at)
  for (const [i, now] of frames.entries()) {
    while (pending.length && (pending[0] as { at: number }).at <= now) {
      const tap = pending.shift() as { at: number; beat: number | null }
      const tempo = bpm(tap.at)
      if (tempo !== null) state = alignToTap(state, tap.at, 60_000 / tempo, tap.beat)
    }
    const result = step(state, { now, bpm: bpm(now), beatsPerBar })
    state = result.state
    if (result.flash) flashes.push({ at: now, kind: result.flash, paint: frames[i + 1] ?? now + 1000 / 30 })
  }
  return { flashes, state }
}

/** Frame times at `hz` from `from` for `seconds`, with up to `jitterMs` of lateness on each. */
function frames(seconds: number, hz = 60, jitterMs = 0, seed = 1, from = 0): number[] {
  const next = random(seed)
  const period = 1000 / hz
  return Array.from({ length: Math.floor((seconds * 1000) / period) }, (_, i) => from + i * period + next() * jitterMs)
}

/** The most flashes inside any half-open window of FLASH_WINDOW_MS. */
function worstWindow(flashes: readonly Flash[]): number {
  let worst = 0
  for (let i = 0; i < flashes.length; i++) {
    const start = (flashes[i] as Flash).at
    const inside = flashes.filter((f) => f.at >= start && f.at < start + FLASH_WINDOW_MS).length
    worst = Math.max(worst, inside)
  }
  return worst
}

function smallestGap(flashes: readonly Flash[]): number {
  return flashes.slice(1).reduce((gap, f, i) => Math.min(gap, f.at - (flashes[i] as Flash).at), Infinity)
}

/** The tightest span of MAX_FLASHES_PER_WINDOW + 1 consecutive onsets, by `clock`. */
function tightestSpan(flashes: readonly Flash[], clock: 'at' | 'paint'): number {
  const n = MAX_FLASHES_PER_WINDOW
  return flashes.slice(n).reduce((span, f, i) => Math.min(span, f[clock] - (flashes[i] as Flash)[clock]), Infinity)
}

/** What breaks the safety rules, or null: the label goes in the sweep's list of failures. */
function unsafe(flashes: readonly Flash[], label: string): string | null {
  const worst = worstWindow(flashes)
  const gap = smallestGap(flashes)
  const decided = tightestSpan(flashes, 'at')
  const painted = tightestSpan(flashes, 'paint')
  if (worst > MAX_FLASHES_PER_WINDOW) return `${label}: ${worst} flashes in one second`
  if (gap < MIN_GAP_MS) return `${label}: two flashes ${gap.toFixed(1)} ms apart`
  if (decided < FOUR_ONSETS_SPAN_MS) return `${label}: 4 onsets in ${decided.toFixed(1)} ms`
  if (painted < FOUR_PAINTS_SPAN_MS) return `${label}: 4 paints in ${painted.toFixed(1)} ms`
  return null
}

function assertSafe(flashes: readonly Flash[], label: string) {
  const failure = unsafe(flashes, label)
  assert.equal(failure, null, failure ?? '')
}

// ── At most 3 flash onsets in any one-second window ─────────────────────────────────────────

test('the cap is WCAG 2.3.1\'s, three flashes in any one second, held with a margin', () => {
  assert.equal(MAX_FLASHES_PER_WINDOW, 3)
  assert.equal(FLASH_WINDOW_MS, 1000)
  assert.equal(FLASH_WINDOW_MS + CAP_MARGIN_MS, FOUR_ONSETS_SPAN_MS)
  // Three frames of a 30 Hz screen, the slowest the tests use: a paint one frame late, a dropped
  // frame and timer jitter together still leave the painted flashes more than 1 s apart.
  assert.ok(CAP_MARGIN_MS >= 3 * (1000 / 30), `${CAP_MARGIN_MS} ms`)
  assert.equal(EVERY_OTHER_BEAT_ABOVE_BPM, 150)
})

test('mayFlash: a fourth flash inside one second is refused, and allowed once the first leaves the window', () => {
  assert.ok(mayFlash([], 0))
  assert.ok(mayFlash([0, 340, 680], FOUR_ONSETS_SPAN_MS))
  assert.ok(!mayFlash([0, 340, 680], FOUR_ONSETS_SPAN_MS - 1))
  assert.ok(!mayFlash([0, 340, 680], 1000), 'a fourth exactly one second after the first has no margin')
  assert.ok(!mayFlash([0, 340, 680], 990))
  assert.ok(!mayFlash([100], 100 + MIN_GAP_MS - 1), 'too close to the last flash')
  assert.ok(!mayFlash([500], 400), 'a clock that runs backwards never flashes')
})

test('every tempo from 20 to 300 BPM stays within the cap and its margin, at 30, 60 and 144 Hz with frame jitter', () => {
  const failures: string[] = []
  for (let bpm = 20; bpm <= 300; bpm += 1) {
    for (const hz of [30, 60, 144]) {
      const { flashes } = run({ frames: frames(8, hz, 1000 / hz / 2, bpm), bpm: () => bpm })
      assert.ok(flashes.length >= 2, `${bpm} BPM at ${hz} Hz: ${flashes.length} flashes`)
      const failure = unsafe(flashes, `${bpm} BPM at ${hz} Hz`)
      if (failure) failures.push(failure)
    }
  }
  // Every failing tempo is listed, so a red run shows where the margin is missing.
  assert.deepEqual(failures, [])
})

test('a steady tempo never loses a flash to the margin: every beat up to the switch, every second beat above', () => {
  const failures: string[] = []
  for (let bpm = 20; bpm <= 300; bpm += 1) {
    for (const hz of [30, 60, 144]) {
      const times = frames(8, hz, 1000 / hz / 2, bpm)
      const { flashes } = run({ frames: times, bpm: () => bpm })
      const period = 60_000 / bpm
      const every = bpm > EVERY_OTHER_BEAT_ABOVE_BPM ? 2 : 1
      const origin = times[0] as number
      const last = times[times.length - 1] as number
      // The grid starts on the first frame; a beat whose late window ends before the run does must show in it.
      for (let beat = 0; origin + beat * period + MAX_LATE_MS < last; beat += every) {
        const due = origin + beat * period
        if (!flashes.some((f) => f.at >= due && f.at <= due + MAX_LATE_MS)) {
          failures.push(`${bpm} BPM at ${hz} Hz: beat ${beat} at ${due.toFixed(1)} did not flash`)
          break
        }
      }
    }
  }
  assert.deepEqual(failures, [])
})

test('above 150 BPM it flashes on every second beat, and up to 150 on every beat', () => {
  assert.equal(beatsPerFlash(150), 1)
  assert.equal(beatsPerFlash(150.5), 2)
  assert.equal(beatsPerFlash(300), 2)
  assert.equal(beatsPerFlash(20), 1)
  // Flash counts over 10 s on an uneven 60 Hz screen.
  const count = (bpm: number) => run({ frames: frames(10, 60, 8, 7), bpm: () => bpm }).flashes.length
  assert.equal(count(150), 25, `150 BPM: ${count(150)} flashes in 10 s`)
  assert.ok(count(151) >= 12 && count(151) <= 13, `151 BPM: ${count(151)} flashes in 10 s`)
  assert.ok(count(179) >= 14 && count(179) <= 15, `179 BPM: ${count(179)} flashes in 10 s`)
  assert.ok(count(300) >= 24 && count(300) <= 26, `300 BPM: ${count(300)} flashes in 10 s`)
  assert.ok(count(120) >= 19 && count(120) <= 21, `120 BPM: ${count(120)} flashes in 10 s`)
})

test('tempo changes on every frame, between any two tempos, never break the cap', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const next = random(seed)
    const changes = Array.from({ length: 40 }, () => ({ at: next() * 10_000, bpm: 20 + next() * 280 })).sort((a, b) => a.at - b.at)
    const bpm = (at: number) => [...changes].reverse().find((change) => change.at <= at)?.bpm ?? 120
    for (const hz of [30, 60, 144]) {
      const { flashes } = run({ frames: frames(10, hz, 1000 / hz / 2, seed), bpm })
      assertSafe(flashes, `tempo changes at ${hz} Hz, seed ${seed}`)
    }
  }
})

test('the switch to every second beat, crossed back and forth, never breaks the cap', () => {
  for (let seed = 1; seed <= 20; seed++) {
    for (const hz of [30, 60, 144]) {
      const next = random(seed)
      const bpm = (at: number) => (Math.floor(at / (150 + seed * 10)) % 2 === 0 ? 149 + next() : 151 + next() * 2)
      const { flashes } = run({ frames: frames(10, hz, 1000 / hz / 2, seed), bpm })
      assertSafe(flashes, `around the switch at ${hz} Hz, seed ${seed}`)
    }
  }
})

// ── Tapping along never keeps the light dark ────────────────────────────────────────────────

/**
 * Taps every `everyMs` from `from` to `to`, each up to `jitterMs` early or late, as the page sends
 * them: the first of the run is the downbeat, each later one the nearest beat on the grid.
 */
function steadyTaps(everyMs: number, from: number, to: number, jitterMs: number, seed: number) {
  const next = random(seed)
  const count = Math.floor((to - from) / everyMs)
  return Array.from({ length: count }, (_, i) => ({ at: from + i * everyMs + (next() * 2 - 1) * jitterMs, beat: i === 0 ? 0 : null }))
}

test('tapping along at the tempo flashes on nearly every beat while the taps go on, within the cap', () => {
  // A tap is a beat: it flashes on the tap, where moving the grid a period past each tap would
  // leave every flash due just after the next tap, so the light stayed dark while a visitor tapped.
  for (const bpm of [60, 90, 120, 150]) {
    for (const hz of [30, 60, 144]) {
      for (let seed = 1; seed <= 10; seed++) {
        const period = 60_000 / bpm
        const offset = random(seed + 100)() * period
        const taps = steadyTaps(period, 1000 + offset, 11_000, 25, seed)
        const { flashes } = run({ frames: frames(12, hz, 1000 / hz / 2, seed), bpm: () => bpm, taps })
        const label = `taps at ${bpm} BPM, ${hz} Hz, seed ${seed}`
        const during = flashes.filter((f) => f.at >= 1000 + offset + period && f.at < 11_000)
        const beats = Math.floor((10_000 - offset - period) / period)
        assert.ok(during.length >= Math.floor(beats * 0.9), `${label}: ${during.length} flashes for ${beats} beats`)
        assertSafe(flashes, label)
      }
    }
  }
})

test('taps at twice the tempo still flash, within the cap', () => {
  for (const bpm of [60, 90, 120, 150]) {
    for (const hz of [30, 60, 144]) {
      for (let seed = 1; seed <= 10; seed++) {
        const period = 60_000 / bpm
        const taps = steadyTaps(period / 2, 1000, 11_000, 15, seed)
        const { flashes } = run({ frames: frames(12, hz, 1000 / hz / 2, seed), bpm: () => bpm, taps })
        const label = `taps at twice ${bpm} BPM, ${hz} Hz, seed ${seed}`
        const during = flashes.filter((f) => f.at >= 1000 + period && f.at < 11_000)
        const beats = Math.floor((10_000 - period) / period)
        assert.ok(during.length >= Math.floor(beats * 0.9), `${label}: ${during.length} flashes for ${beats} beats`)
        assertSafe(flashes, label)
      }
    }
  }
})

test('above the switch, tapping on every second beat flashes on every tap, evenly', () => {
  // Tapping along with the flashes at a drum and bass tempo: each tap is the nearest beat on the
  // grid, so it keeps the grid's count and lands on a flashing beat. Counting taps as beats put
  // every second tap on a beat that doesn't flash, and the light ran 350 ms, 1050 ms, 350 ms...
  for (const bpm of [151, 170, 174, 220, 300]) {
    for (const hz of [30, 60, 144]) {
      for (let seed = 1; seed <= 10; seed++) {
        const period = 60_000 / bpm
        const taps = steadyTaps(2 * period, 1000, 11_000, 15, seed)
        const { flashes } = run({ frames: frames(12, hz, 1000 / hz / 2, seed), bpm: () => bpm, taps })
        const label = `taps on every second beat at ${bpm} BPM, ${hz} Hz, seed ${seed}`
        const during = flashes.filter((f) => f.at >= 1000 && f.at < 11_000 - 2 * period)
        assert.ok(during.length >= taps.length - 2, `${label}: ${during.length} flashes for ${taps.length} taps`)
        const widest = during.slice(1).reduce((gap, f, i) => Math.max(gap, f.at - (during[i] as Flash).at), 0)
        assert.ok(widest <= 2 * period + 70, `${label}: a gap of ${widest.toFixed(0)} ms`)
        assertSafe(flashes, label)
      }
    }
  }
})

test('a tap marks the nearest beat on the grid, and the first of a run the downbeat', () => {
  // 120 BPM from 0: beats at 0, 500, 1000... A tap at 1530 is beat 3 (counted from 0), moved to 1530.
  const running = run({ frames: frames(1.2, 60), bpm: () => 120 }).state
  const late = alignToTap(running, 1530, 500, null)
  assert.deepEqual(late.cursor, { tick: 3, time: 1530 })
  const early = alignToTap(running, 1480, 500, null)
  assert.deepEqual(early.cursor, { tick: 3, time: 1480 })
  assert.deepEqual(alignToTap(running, 1530, 500, 0).cursor, { tick: 0, time: 1530 })
  // No grid yet: the tap starts one, on the beat it marks or the downbeat.
  assert.deepEqual(alignToTap(start(), 200, 500, null).cursor, { tick: 0, time: 200 })
})

test('taps that move the phase, however often, never double a flash or break the cap', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const next = random(seed)
    const taps = Array.from({ length: 60 }, (_, i) => ({ at: next() * 10_000, beat: i }))
    const tempo = 60 + seed * 6
    for (const hz of [30, 60, 144]) {
      const { flashes } = run({ frames: frames(10, hz, 1000 / hz / 2, seed), bpm: () => tempo, taps })
      assertSafe(flashes, `taps at ${tempo} BPM, ${hz} Hz, seed ${seed}`)
    }
  }
})

test('a tap right after a flash pulls the next beat close, and the gate holds it back', () => {
  // A flash at 0, then a tap at 60 ms that says the beat is there: the next beat on the new grid
  // is at 60 + 333 ms at 180 BPM, and the window still holds the earlier flashes.
  const { flashes } = run({
    frames: frames(4, 60),
    bpm: () => 180,
    taps: [100, 150, 200, 250, 300, 1100, 1110, 1120].map((at, beat) => ({ at, beat })),
  })
  assertSafe(flashes, 'taps right after flashes')
})

test('a stalled page never shows the beats it missed, late or in a burst', () => {
  // 120 BPM, then no frame for 3 s (a busy main thread), then frames again.
  const before = frames(2, 60)
  const after = frames(2, 60, 0, 1, 5000)
  const { flashes } = run({ frames: [...before, ...after], bpm: () => 120 })
  const resumed = flashes.filter((f) => f.at >= 5000)
  assert.ok(resumed.length <= 5, `${resumed.length} flashes in the 2 s after the stall`)
  assertSafe(flashes, 'after a stall')
  // Every flash is shown within MAX_LATE_MS of its beat on the grid, which starts at 0.
  for (const flash of flashes) {
    const late = flash.at % 500
    assert.ok(late <= MAX_LATE_MS + 1000 / 60, `a flash ${late.toFixed(1)} ms late`)
  }
})

test('a faster tempo takes over from the last beat, not after the old tempo\'s next beat', () => {
  // 20 BPM flashes at the start, then 120 BPM from 1000 ms: the next flash comes on the new grid within
  // one new period, where waiting for the old next beat would leave the light dark until 3000.
  const { flashes } = run({ frames: frames(3, 60), bpm: (at) => (at < 1000 ? 20 : 120) })
  assert.ok((flashes[0]?.at ?? Infinity) < 1000 / 30, 'the first flash, a frame after the start')
  const first = flashes[1]?.at ?? Infinity
  assert.ok(first >= 1000 && first < 1000 + 500 + 1000 / 60, `the first flash at the new tempo came at ${first}`)
  assertSafe(flashes, 'a tempo change')
})

test('the microphone mode shows nothing until it has a tempo', () => {
  const { flashes } = run({ frames: frames(3, 60), bpm: (at) => (at < 2000 ? null : 128) })
  assert.ok(flashes.length > 0)
  assert.ok(flashes.every((f) => f.at >= 2000), 'a flash before the first reading')
})

test('the downbeat is the accented flash, every beatsPerBar beats, counted from a tap', () => {
  const { flashes } = run({ frames: frames(4, 60), bpm: () => 120, beatsPerBar: 4 })
  assert.deepEqual(flashes.slice(0, 8).map((f) => f.kind), ['accent', 'beat', 'beat', 'beat', 'accent', 'beat', 'beat', 'beat'])
  const one = run({ frames: frames(2, 60), bpm: () => 120, beatsPerBar: 1 }).flashes
  assert.ok(one.every((f) => f.kind === 'accent'), 'one beat per bar: every beat is a downbeat')
  // A tap marking beat 0 at 1250 ms is a downbeat flash itself, and puts the next at 1250 + 4 beats.
  const tapped = run({ frames: frames(5, 60), bpm: () => 120, taps: [{ at: 1250, beat: 0 }] }).flashes
  const accents = tapped.filter((f) => f.kind === 'accent' && f.at >= 1250).map((f) => f.at)
  assert.ok(Math.abs((accents[0] as number) - 1250) <= 1000 / 60 + 1, `the tap's downbeat at ${accents[0]}`)
  assert.ok(Math.abs((accents[1] as number) - 3250) <= 1000 / 60 + 1, `next downbeat at ${accents[1]}`)
})

// ── No saturated red ────────────────────────────────────────────────────────────────────────

test('isSaturatedRed follows WCAG: red over 80% of R + G + B, in sRGB or linear light', () => {
  for (const red of ['#ff0000', '#e00000', '#ff1010', '#cc0000', '#ff3300']) assert.ok(isSaturatedRed(red), red)
  for (const safe of ['#ffffff', '#000000', '#8fa8ff', '#ff8888', '#808080']) assert.ok(!isSaturatedRed(safe), safe)
  assert.throws(() => isSaturatedRed('red'), RangeError)
})

test('no flash colour, in either style, is a saturated red', () => {
  for (const [kind, color] of Object.entries(FLASH_COLORS)) assert.ok(!isSaturatedRed(color), `${kind}: ${color}`)
  for (const style of ['flash', 'pulse'] as const) {
    for (const kind of ['accent', 'beat'] as const) assert.ok(!isSaturatedRed(flashAnimation(style, kind, 500).color))
  }
})

// ── prefers-reduced-motion defaults to the soft pulse ───────────────────────────────────────

test('prefers-reduced-motion starts on the soft pulse; otherwise the full flash', () => {
  assert.equal(initialStyle(true), 'pulse')
  assert.equal(initialStyle(false), 'flash')
})

test('the soft pulse is soft: a low peak and a gradual rise, where the flash is full and instant', () => {
  const pulse = flashAnimation('pulse', 'accent', 500)
  const flash = flashAnimation('flash', 'accent', 500)
  assert.ok(pulse.peakOpacity <= 0.4 && pulse.attackMs >= 40, JSON.stringify(pulse))
  assert.equal(flash.peakOpacity, 1)
  // Each flash is over before the next can start, so a flash never blends into a steady light.
  for (const style of ['flash', 'pulse'] as const) {
    for (const interval of [MIN_GAP_MS, 333, 500, 3000]) {
      const { attackMs, decayMs } = flashAnimation(style, 'beat', interval)
      assert.ok(attackMs + decayMs < interval, `${style} at ${interval} ms: ${attackMs + decayMs} ms`)
    }
  }
})

// ── Nothing flashes before a click ──────────────────────────────────────────────────────────

test('idle never flashes, whatever time passes and whatever tempo there is', () => {
  const { flashes, state } = run({ frames: frames(10, 60), bpm: () => 120 }, IDLE)
  assert.deepEqual(flashes, [])
  assert.equal(state.running, false)
})

test('a tap while idle lines nothing up and starts nothing', () => {
  const state = alignToTap(IDLE, 100, 500, 0)
  assert.deepEqual(state, IDLE)
  assert.deepEqual(run({ frames: frames(3, 60), bpm: () => 120 }, state).flashes, [])
})

// ── Every stop path stops it, and nothing restarts it ───────────────────────────────────────

test('stop() leaves it stopped from any state, and nothing after it flashes again', () => {
  const running = run({ frames: frames(2, 60), bpm: () => 120 }).state
  assert.equal(running.running, true)
  const stopped = stop(running)
  assert.deepEqual({ ...stopped, shown: [] }, { ...IDLE, shown: [] })
  // It keeps when the last flashes were, so a start right after can't add one to the window.
  assert.deepEqual(stopped.shown, running.shown)
  // Time passing, tempo changes and taps: none of them is a start.
  const after = run({ frames: frames(10, 60, 0, 1, 2000), bpm: (at) => 60 + (at % 200), taps: [{ at: 3000, beat: 0 }] }, stopped)
  assert.deepEqual(after.flashes, [])
  assert.equal(after.state.running, false)
})

test('start() is the only way from stopped to running', () => {
  assert.equal(start().running, true)
  assert.equal(start(stop(start())).running, true)
  assert.equal(IDLE.running, false)
  assert.ok(Object.isFrozen(IDLE), 'IDLE cannot be changed into a running state')
})

test('stopping and starting again, however fast, never breaks the cap or the gap', () => {
  // Holding Enter on Start and Esc, or clicking Start and the light in turn: every start would
  // flash at once if the history went with the stop.
  for (let seed = 1; seed <= 120; seed++) {
    const next = random(seed)
    let state = start()
    const flashes: Flash[] = []
    const tempo = 20 + (seed % 40) * 7
    const hz = [30, 60, 144][seed % 3] as number
    const times = frames(10, hz, 1000 / hz / 2, seed)
    for (const [i, now] of times.entries()) {
      if (next() < 0.15) state = state.running ? stop(state) : start(state)
      const result = step(state, { now, bpm: tempo, beatsPerBar: 4 })
      state = result.state
      if (result.flash) flashes.push({ at: now, kind: result.flash, paint: times[i + 1] ?? now + 1000 / hz })
    }
    assert.ok(flashes.length > 0, `seed ${seed} never flashed`)
    assertSafe(flashes, `stop and start at ${tempo} BPM, ${hz} Hz, seed ${seed}`)
  }
})

test('a click too soon after a stop is not a start: a ghost click or a held key can\'t restart it', () => {
  // A tap on the light stops it and reveals the Start button under the finger; the browser's
  // click from that same tap, or a repeating Enter, would start it again.
  assert.equal(RESTART_GUARD_MS, 500)
  assert.equal(isTooSoonAfterStop(null, 10), false, 'never stopped: the first start is allowed')
  assert.equal(isTooSoonAfterStop(1000, 1000), true)
  assert.equal(isTooSoonAfterStop(1000, 1000 + RESTART_GUARD_MS - 1), true)
  assert.equal(isTooSoonAfterStop(1000, 1000 + RESTART_GUARD_MS), false)
  // A click stamped before the stop is earlier than it, so it is not a start either.
  assert.equal(isTooSoonAfterStop(1000, 900), true)
})
