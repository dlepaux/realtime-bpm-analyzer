// Run with `npm test`. The strobe light's safety rules (RBA-237, WCAG 2.3.1 Three Flashes or Below
// Threshold), tested where they are decided: tools/strobe.ts. The page only draws what step()
// returns, so these hold for every tempo source, tap and tempo change the page can produce.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EVERY_OTHER_BEAT_ABOVE_BPM,
  FLASH_COLORS,
  FLASH_WINDOW_MS,
  IDLE,
  MAX_FLASHES_PER_WINDOW,
  MAX_LATE_MS,
  MIN_GAP_MS,
  alignToTap,
  beatsPerFlash,
  flashAnimation,
  initialStyle,
  isSaturatedRed,
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

type Flash = { at: number; kind: FlashKind }

type Run = {
  frames: number[]
  /** The tempo at a frame's time, or null while the microphone has none. */
  bpm: (at: number) => number | null
  beatsPerBar?: number
  /** Taps that line the grid up, with the beat each one marks. */
  taps?: { at: number; beat: number }[]
}

function run({ frames, bpm, beatsPerBar = 4, taps = [] }: Run, from: Strobe = start()): { flashes: Flash[]; state: Strobe } {
  let state = from
  const flashes: Flash[] = []
  const pending = [...taps].sort((a, b) => a.at - b.at)
  for (const now of frames) {
    while (pending.length && (pending[0] as { at: number }).at <= now) {
      const tap = pending.shift() as { at: number; beat: number }
      const tempo = bpm(tap.at)
      if (tempo !== null) state = alignToTap(state, tap.at, 60_000 / tempo, tap.beat)
    }
    const result = step(state, { now, bpm: bpm(now), beatsPerBar })
    state = result.state
    if (result.flash) flashes.push({ at: now, kind: result.flash })
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

function assertSafe(flashes: readonly Flash[], label: string) {
  assert.ok(worstWindow(flashes) <= MAX_FLASHES_PER_WINDOW, `${label}: ${worstWindow(flashes)} flashes in one second`)
  assert.ok(smallestGap(flashes) >= MIN_GAP_MS, `${label}: two flashes ${smallestGap(flashes).toFixed(1)} ms apart`)
}

// ── At most 3 flash onsets in any one-second window ─────────────────────────────────────────

test('the cap is WCAG 2.3.1\'s: no more than three flashes in any one second', () => {
  assert.equal(MAX_FLASHES_PER_WINDOW, 3)
  assert.equal(FLASH_WINDOW_MS, 1000)
  assert.equal(EVERY_OTHER_BEAT_ABOVE_BPM, 180)
})

test('mayFlash: a fourth flash inside one second is refused, and allowed once the first leaves the window', () => {
  assert.ok(mayFlash([], 0))
  assert.ok(mayFlash([0, 340, 680], 1000))
  assert.ok(!mayFlash([0, 340, 680], 999))
  assert.ok(!mayFlash([0, 340, 680], 990))
  assert.ok(!mayFlash([100], 100 + MIN_GAP_MS - 1), 'too close to the last flash')
  assert.ok(!mayFlash([500], 400), 'a clock that runs backwards never flashes')
})

test('every tempo from 20 to 300 BPM stays within the cap, at 30, 60 and 144 Hz with frame jitter', () => {
  for (let bpm = 20; bpm <= 300; bpm += 1) {
    for (const hz of [30, 60, 144]) {
      const { flashes } = run({ frames: frames(8, hz, 1000 / hz / 2, bpm), bpm: () => bpm })
      assert.ok(flashes.length >= 2, `${bpm} BPM at ${hz} Hz: ${flashes.length} flashes`)
      assertSafe(flashes, `${bpm} BPM at ${hz} Hz`)
    }
  }
})

test('above 180 BPM it flashes on every second beat, and up to 180 on every beat', () => {
  assert.equal(beatsPerFlash(180), 1)
  assert.equal(beatsPerFlash(180.5), 2)
  assert.equal(beatsPerFlash(300), 2)
  assert.equal(beatsPerFlash(20), 1)
  // Flash counts over 10 s. rAF's frame times are even, and on an even 60, 120 or 144 Hz screen
  // 180 BPM shows every beat: a beat the cap holds back waits a few ms for its turn.
  for (const hz of [60, 120, 144]) {
    assert.equal(run({ frames: frames(10, hz), bpm: () => 180 }).flashes.length, 30, `180 BPM at ${hz} Hz`)
  }
  // At the cap itself, uneven frames leave no slack, and the cap wins: a beat is skipped now and
  // then, never shown early. The page states this limit.
  const count = (bpm: number) => run({ frames: frames(10, 60, 8, 7), bpm: () => bpm }).flashes.length
  assert.ok(count(180) >= 26, `180 BPM: ${count(180)} flashes in 10 s`)
  assert.ok(count(181) >= 14 && count(181) <= 16, `181 BPM: ${count(181)} flashes in 10 s`)
  assert.ok(count(300) >= 24 && count(300) <= 26, `300 BPM: ${count(300)} flashes in 10 s`)
  assert.ok(count(120) >= 19 && count(120) <= 21, `120 BPM: ${count(120)} flashes in 10 s`)
})

test('tempo changes on every frame, between any two tempos, never break the cap', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const next = random(seed)
    const changes = Array.from({ length: 40 }, () => ({ at: next() * 10_000, bpm: 20 + next() * 280 })).sort((a, b) => a.at - b.at)
    const bpm = (at: number) => [...changes].reverse().find((change) => change.at <= at)?.bpm ?? 120
    const { flashes } = run({ frames: frames(10, 60, 8, seed), bpm })
    assertSafe(flashes, `tempo changes, seed ${seed}`)
  }
})

test('the switch to every second beat at 180 BPM, crossed back and forth, never breaks the cap', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const next = random(seed)
    const bpm = (at: number) => (Math.floor(at / (150 + seed * 10)) % 2 === 0 ? 179 + next() : 181 + next() * 2)
    const { flashes } = run({ frames: frames(10, 60, 8, seed), bpm })
    assertSafe(flashes, `around 180, seed ${seed}`)
  }
})

test('taps that move the phase, however often, never double a flash or break the cap', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const next = random(seed)
    const taps = Array.from({ length: 60 }, (_, i) => ({ at: next() * 10_000, beat: i }))
    const tempo = 60 + seed * 6
    const { flashes } = run({ frames: frames(10, 60, 8, seed), bpm: () => tempo, taps })
    assertSafe(flashes, `taps at ${tempo} BPM, seed ${seed}`)
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
  // A tap marking beat 0 at 1250 ms puts the next downbeat at 1250 + 4 beats.
  const tapped = run({ frames: frames(5, 60), bpm: () => 120, taps: [{ at: 1250, beat: 0 }] }).flashes
  const accents = tapped.filter((f) => f.kind === 'accent' && f.at > 1250).map((f) => f.at)
  assert.ok(Math.abs((accents[0] as number) - 3250) <= 1000 / 60 + 1, `next downbeat at ${accents[0]}`)
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

test('stop() leaves it idle from any state, and nothing after it flashes again', () => {
  const running = run({ frames: frames(2, 60), bpm: () => 120 }).state
  assert.equal(running.running, true)
  const stopped = stop()
  assert.deepEqual(stopped, IDLE)
  // Time passing, tempo changes and taps: none of them is a start.
  const after = run({ frames: frames(10, 60, 0, 1, 2000), bpm: (at) => 60 + (at % 200), taps: [{ at: 3000, beat: 0 }] }, stopped)
  assert.deepEqual(after.flashes, [])
  assert.equal(after.state.running, false)
})

test('start() is the only way from idle to running', () => {
  assert.equal(start().running, true)
  assert.equal(IDLE.running, false)
  assert.ok(Object.isFrozen(IDLE), 'IDLE cannot be changed into a running state')
})
