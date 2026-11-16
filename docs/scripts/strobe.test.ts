// Run with `npm test`. The strobe light's safety rules (RBA-237, WCAG 2.3.1 Three Flashes or Below
// Threshold), tested where they are decided: tools/strobe.ts. The light flashes on the library's
// kick event, so the page can produce any pattern of kicks: these cases are generated, and the
// rules must hold for all of them, at any screen rate.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BREAK_MS,
  CAP_MARGIN_MS,
  EVERY_KICK_UP_TO_BPM,
  FLASH_COLORS,
  FLASH_WINDOW_MS,
  IDLE,
  MAX_FLASHES_PER_WINDOW,
  MAX_LATE_MS,
  MIN_GAP_MS,
  RESTART_GUARD_MS,
  STROBE_SOURCES,
  addKick,
  flashAnimation,
  flashTimeFor,
  markTimeFor,
  startKeyHeld,
  SPEAKER_DELAY_MS,
  heardAt,
  initialStyle,
  isSaturatedRed,
  isTooSoonAfterStop,
  kicksPerFlash,
  mayFlash,
  playsInPage,
  start,
  step,
  stop,
  type Strobe,
} from '../.vitepress/tools/strobe.ts'
import { FRAME_BUDGET_MS } from '../.vitepress/tools/spectrogram.ts'

/** A small seeded generator, so a failing case can be replayed from its seed. */
function random(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

/** A kick as the page sees it: when its event arrives, and when the light should show it. */
type Kick = { arrives: number; at: number; strength: number }

/**
 * Runs the strobe over `kicks` on a screen at `hz`, each frame `jitter` ms late at most, the way
 * the component does: kicks that arrived before the frame are added, then the frame steps.
 */
function run(kicks: readonly Kick[], hz: number, rand: () => number, jitter = 2, end?: number) {
  const until = end ?? (kicks[kicks.length - 1]?.at ?? 0) + 2000
  let state: Strobe = start()
  let next = 0
  const flashes: number[] = []
  for (let frame = 0, now = 0; now < until; frame++, now = (frame * 1000) / hz + rand() * jitter) {
    while (next < kicks.length && (kicks[next] as Kick).arrives <= now) {
      const kick = kicks[next++] as Kick
      state = addKick(state, kick.at, kick.strength)
    }
    const result = step(state, now)
    state = result.state
    if (result.flash) flashes.push(now)
  }
  return flashes
}

/** Kicks at `times`, shown when they arrive (the mic), with a detector delay of 18 to 28 ms. */
const fromRoom = (times: readonly number[], rand: () => number): Kick[] =>
  times.map((time) => {
    const arrives = time + 18 + rand() * 10
    return { arrives, at: arrives, strength: 0.5 + rand() / 2 }
  })

/** Kicks played by the page: the event arrives before the listener hears them, as on Chrome. */
const fromPage = (times: readonly number[], rand: () => number): Kick[] =>
  times.map((time) => ({ arrives: time - 5 - rand() * 20, at: time, strength: 0.5 + rand() / 2 }))

function steady(bpm: number, from: number, to: number, rand: () => number, jitter = 3): number[] {
  const period = 60_000 / bpm
  const times: number[] = []
  for (let t = from; t < to; t += period) times.push(t + (rand() - 0.5) * 2 * jitter)
  return times
}

/** The cap, read on the flash times: four in a row span the guarded window, and none come too close. */
function assertCap(flashes: readonly number[], label: string) {
  for (let i = 3; i < flashes.length; i++) {
    const span = (flashes[i] as number) - (flashes[i - 3] as number)
    assert.ok(span >= FLASH_WINDOW_MS + CAP_MARGIN_MS, `${label}: 4 flashes in ${span.toFixed(1)} ms ending at ${flashes[i]}`)
  }
  for (let i = 1; i < flashes.length; i++) {
    assert.ok((flashes[i] as number) - (flashes[i - 1] as number) >= MIN_GAP_MS, `${label}: two flashes ${MIN_GAP_MS} ms apart or less at ${flashes[i]}`)
  }
  for (const at of flashes) {
    const inWindow = flashes.filter((other) => other >= at && other - at < FLASH_WINDOW_MS).length
    assert.ok(inWindow <= MAX_FLASHES_PER_WINDOW, `${label}: ${inWindow} flashes in the second from ${at}`)
  }
}

// ── Generated patterns: the cap holds whatever the kicks do ─────────────────────────────────

const RATES = [30, 60, 120, 144]

/** Each pattern draws its kick times from a seed: the kinds of music, and worse, the event can carry. */
const PATTERNS: Record<string, (rand: () => number) => number[]> = {
  'a steady tempo from 40 to 400 BPM': (rand) => steady(40 + rand() * 360, 0, 12_000, rand),
  'a tempo change at a random point': (rand) => {
    const cut = 3000 + rand() * 6000
    return [...steady(60 + rand() * 240, 0, cut, rand), ...steady(60 + rand() * 240, cut, 14_000, rand)]
  },
  'bursts and rolls inside a groove': (rand) => {
    const times: number[] = []
    for (let t = 0; t < 14_000;) {
      times.push(t)
      // A roll: kicks 80 to 150 ms apart, the closest the detector reports, for up to 16 kicks.
      if (rand() < 0.15) for (let n = Math.floor(rand() * 16); n > 0; n--) times.push((t += 80 + rand() * 70))
      t += 300 + rand() * 300
    }
    return times
  },
  'irregular gaps from 80 ms to 2.5 s': (rand) => {
    const times: number[] = []
    for (let t = 0; t < 15_000; t += 80 + rand() ** 2 * 2420) times.push(t)
    return times
  },
  'kicks every 80 ms': () => Array.from({ length: 150 }, (_, i) => i * 80),
  'a breakdown, then the drop': (rand) => [...steady(128, 0, 6000, rand), ...steady(128, 13_000, 20_000, rand)],
}

for (const [name, pattern] of Object.entries(PATTERNS)) {
  test(`the cap holds for ${name}, at every screen rate, mic or page timing (60 seeds)`, () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rand = random(seed)
      const times = pattern(rand)
      for (const hz of RATES) {
        assertCap(run(fromRoom(times, rand), hz, rand), `${name}, seed ${seed}, ${hz} Hz, room`)
        assertCap(run(fromPage(times, rand), hz, rand), `${name}, seed ${seed}, ${hz} Hz, page`)
      }
    }
  })
}

test('the cap holds when two kicks carry the same time or arrive out of order', () => {
  const rand = random(7)
  const kicks: Kick[] = []
  for (let t = 0; t < 8000; t += 90) kicks.push({ arrives: t, at: t - (rand() < 0.3 ? 200 : 0), strength: 1 })
  assertCap(run(kicks, 60, rand), 'out of order')
})

// ── Regular at a steady tempo ───────────────────────────────────────────────────────────────

test(`a steady tempo up to ${EVERY_KICK_UP_TO_BPM} BPM flashes on every kick, on the first frame that shows it`, () => {
  for (let bpm = 40; bpm <= EVERY_KICK_UP_TO_BPM - 2; bpm++) {
    for (const hz of [30, 60, 144]) {
      const rand = random(bpm * hz)
      const times = steady(bpm, 0, 12_000, rand, 2)
      const flashes = run(fromPage(times, rand), hz, rand, 1)
      assert.equal(flashes.length, times.length, `${bpm} BPM at ${hz} Hz: ${flashes.length} flashes for ${times.length} kicks`)
      flashes.forEach((at, i) => {
        const lag = at - (times[i] as number)
        assert.ok(lag >= 0 && lag <= 1000 / hz + 1, `${bpm} BPM at ${hz} Hz: flash ${i} ${lag.toFixed(1)} ms after its kick`)
      })
    }
  }
})

test(`above ${EVERY_KICK_UP_TO_BPM} BPM it flashes on every second kick, regularly, to just under 300 BPM, where every third takes over`, () => {
  for (let bpm = EVERY_KICK_UP_TO_BPM + 2; bpm <= 295; bpm++) {
    for (const hz of [30, 60, 144]) {
      const rand = random(bpm * hz)
      const times = steady(bpm, 0, 12_000, rand, 2)
      const flashes = run(fromPage(times, rand), hz, rand, 1)
      // The first two kicks set the count, then every second one shows.
      assert.ok(Math.abs(flashes.length - times.length / 2) <= 1.5, `${bpm} BPM at ${hz} Hz: ${flashes.length} flashes for ${times.length} kicks`)
      const gaps = flashes.slice(2).map((at, i) => at - (flashes[i + 1] as number))
      const period = (2 * 60_000) / bpm
      for (const gap of gaps) assert.ok(Math.abs(gap - period) <= 1000 / hz + 6, `${bpm} BPM at ${hz} Hz: a gap of ${gap.toFixed(1)} ms, not ${period.toFixed(1)}`)
    }
  }
})

test('a tempo change across the switch moves to every second kick within three kicks, and back', () => {
  const rand = random(3)
  const times = [...steady(140, 0, 6000, rand, 1), ...steady(170, 6000, 12_000, rand, 1), ...steady(140, 12_000, 18_000, rand, 1)]
  const flashes = run(fromPage(times, rand), 60, rand, 1)
  assertCap(flashes, 'tempo change')
  const inside = (from: number, to: number) => flashes.filter((at) => at >= from && at < to)
  assert.equal(inside(1000, 6000).length, times.filter((t) => t >= 1000 && t < 6000).length, 'every kick at 140')
  const at170 = inside(7300, 12_000)
  assert.ok(Math.abs(at170.length - times.filter((t) => t >= 7300 && t < 12_000).length / 2) <= 1, 'every second kick at 170')
  assert.equal(inside(13_500, 18_000).length, times.filter((t) => t >= 13_500 && t < 18_000).length, 'every kick again at 140')
})

test('kicksPerFlash: the fewest kicks that keep flashes 400 ms apart, and it waits for room before going back', () => {
  assert.equal(kicksPerFlash(60_000 / 120, 1), 1)
  assert.equal(kicksPerFlash(60_000 / EVERY_KICK_UP_TO_BPM, 1), 1)
  assert.equal(kicksPerFlash(60_000 / 151, 1), 2)
  assert.equal(kicksPerFlash(60_000 / 300, 1), 2)
  assert.equal(kicksPerFlash(80, 1), 5)
  // From every second kick, 148 BPM stays there until the tempo is clearly below the switch.
  assert.equal(kicksPerFlash(60_000 / 148, 2), 2)
  assert.equal(kicksPerFlash(60_000 / 140, 2), 1)
  assert.equal(kicksPerFlash(Number.NaN, 2), 2)
})

test('a breakdown stops the flashes, and the drop\'s first kick flashes at once', () => {
  const rand = random(11)
  const times = [...steady(128, 0, 6000, rand, 0), ...steady(128, 13_000, 20_000, rand, 0)]
  const flashes = run(fromPage(times, rand), 60, rand, 1)
  const lastBefore = times.filter((t) => t < 6000).pop() as number
  assert.equal(flashes.filter((at) => at > lastBefore + 20 && at < 13_000).length, 0, 'dark through the breakdown')
  const first = flashes.find((at) => at >= 13_000) as number
  assert.ok(first - 13_000 <= 17, `the drop's first kick shows ${first - 13_000} ms late`)
  assert.ok(BREAK_MS <= 2000)
})

// ── Timing, per source ──────────────────────────────────────────────────────────────────────

test('heardAt is RBA-243\'s recipe: now plus the kick\'s distance from currentTime, plus both latencies', () => {
  const clock = { now: 10_000, currentTime: 5, baseLatency: 0.01, outputLatency: 0.03 }
  assert.equal(Math.round(heardAt(4.99, clock)), 10_030)
  // Safari before 17 has no outputLatency, and a missing value counts as none.
  assert.equal(Math.round(heardAt(5, { now: 0, currentTime: 5 })), 0)
})

test('the demo and a file wait until the kick is heard, behind the speakers\' hold, and flash at once when that has passed; the mic and a tab flash on arrival', () => {
  assert.deepEqual([...STROBE_SOURCES], ['demo', 'file', 'mic', 'tab'])
  assert.deepEqual(STROBE_SOURCES.filter(playsInPage), ['demo', 'file'])
  const clock = { now: 1000, currentTime: 2, baseLatency: 0.005, outputLatency: 0.02 }
  const held = SPEAKER_DELAY_MS
  assert.equal(Math.round(flashTimeFor('demo', 1.99, clock)), 1015 + held)
  assert.equal(Math.round(flashTimeFor('file', 1.99, clock)), 1015 + held)
  assert.equal(flashTimeFor('demo', 2 - 0.025 - held / 1000 - 0.05, clock), 1000, 'already heard: at once')
  assert.equal(flashTimeFor('mic', 1.99, clock), 1000)
  assert.equal(flashTimeFor('tab', 1.99, clock), 1000)
})

test('the speakers are held back longer than the kick event takes to arrive, so a song\'s light lands on its kick', () => {
  // Measured on RBA-237 in Chromium: the event reaches the page 13 to 18 ms of audio time after
  // the kick, and the light shows it on a frame (up to 17 ms). The hold covers both several times
  // over, for a busier device, and stays short enough that Start still feels immediate.
  assert.ok(SPEAKER_DELAY_MS >= 3 * (18 + 17), `${SPEAKER_DELAY_MS} ms`)
  assert.ok(SPEAKER_DELAY_MS <= 150, `${SPEAKER_DELAY_MS} ms`)
})

test('a kick waiting for its time flashes on the frame it is heard, never before', () => {
  let state = addKick(start(), 500, 1)
  for (let now = 0; now < 500; now += 16) {
    const result = step(state, now)
    state = result.state
    assert.equal(result.flash, null, `flashed at ${now}, before its kick`)
  }
  assert.ok(step(state, 504).flash)
})

test('a stalled page skips kicks, it never shows them late or in a burst', () => {
  let state = start()
  for (let t = 0; t < 2000; t += 400) state = addKick(state, t, 1)
  const result = step(state, 2100)
  assert.equal(result.flash, null, 'every kick is more than MAX_LATE_MS old')
  assert.equal(step(result.state, 2116).flash, null)
  assert.ok(MAX_LATE_MS <= 50)
})

// ── Before the start, and after a stop ──────────────────────────────────────────────────────

test('stopped, it never flashes and ignores kicks, whatever the kicks and the time', () => {
  for (const state of [IDLE, stop(addKick(start(), 100, 1))]) {
    let current = state
    for (let t = 0; t < 5000; t += 50) {
      current = addKick(current, t, 1)
      const result = step(current, t)
      assert.equal(result.flash, null)
      current = result.state
    }
    assert.equal(current.running, false)
  }
  assert.ok(Object.isFrozen(IDLE))
})

test('stopping and starting fast keeps the cap, since the flash history survives a stop (40 seeds)', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const rand = random(seed)
    let state: Strobe = IDLE
    const flashes: number[] = []
    for (let now = 0; now < 10_000; now += 16) {
      if (rand() < 0.05) state = state.running ? stop(state) : start(state)
      if (rand() < 0.3) state = addKick(state, now, 1)
      const result = step(state, now)
      state = result.state
      if (result.flash) flashes.push(now)
    }
    assertCap(flashes, `seed ${seed}`)
  }
})

test('isTooSoonAfterStop refuses a click within the guard, and never before a first stop', () => {
  assert.equal(isTooSoonAfterStop(null, 0), false)
  assert.equal(isTooSoonAfterStop(1000, 1000 + RESTART_GUARD_MS - 1), true)
  assert.equal(isTooSoonAfterStop(1000, 1000 + RESTART_GUARD_MS), false)
})

test('mayFlash: three in the guarded window, and a minimum gap', () => {
  assert.equal(mayFlash([], 0), true)
  assert.equal(mayFlash([0], MIN_GAP_MS - 1), false)
  assert.equal(mayFlash([0, 400, 800], 1099), false)
  assert.equal(mayFlash([0, 400, 800], 1100), true)
})

// ── Colour and motion ───────────────────────────────────────────────────────────────────────

test('no saturated red: the definition, and every colour the light can show', () => {
  assert.equal(isSaturatedRed('#ff0000'), true)
  assert.equal(isSaturatedRed('#ff4040'), true, 'red in linear light')
  assert.equal(isSaturatedRed('#ffffff'), false)
  for (const color of Object.values(FLASH_COLORS)) assert.equal(isSaturatedRed(color), false, color)
  assert.throws(() => isSaturatedRed('red'), RangeError)
})

test('reduced motion starts on the soft pulse, and the pulse is soft and slow', () => {
  assert.equal(initialStyle(true), 'pulse')
  assert.equal(initialStyle(false), 'flash')
  for (const strength of [0, 0.5, 1]) {
    const pulse = flashAnimation('pulse', strength, 500)
    assert.ok(pulse.peakOpacity <= 0.35 && pulse.attackMs >= 100, JSON.stringify(pulse))
    const flash = flashAnimation('flash', strength, 500)
    assert.ok(flash.peakOpacity >= 0.6 && flash.peakOpacity <= 1)
  }
  // Each ends before the next flash can start, so the stage is dark between.
  for (const style of ['flash', 'pulse'] as const) {
    const { attackMs, decayMs } = flashAnimation(style, 1, MIN_GAP_MS)
    assert.ok(attackMs + decayMs < MIN_GAP_MS, style)
  }
  assert.ok(flashAnimation('flash', 1, 500).peakOpacity > flashAnimation('flash', 0.5, 500).peakOpacity, 'a stronger kick is brighter')
})

test('a key held through a stop never presses Start: the repeats of Enter and Space are refused, a fresh press is not', () => {
  // Space stops the light and focus returns to Start; the key's repeats then land on Start, and
  // a button clicks on Space's release, so each repeat must be refused, not only Enter's.
  assert.equal(startKeyHeld({ key: ' ', repeat: true }), true)
  assert.equal(startKeyHeld({ key: 'Enter', repeat: true }), true)
  assert.equal(startKeyHeld({ key: ' ', repeat: false }), false)
  assert.equal(startKeyHeld({ key: 'Enter', repeat: false }), false)
  assert.equal(startKeyHeld({ key: 'Tab', repeat: true }), false, 'moving on stays possible')
})

test('a kick\'s mark sits at its own time: back in the past for the mic and a tab, after the hold for a song', () => {
  const clock = { now: 1000, currentTime: 2, baseLatency: 0.005, outputLatency: 0.02 }
  assert.equal(Math.round(markTimeFor('mic', 1.98, clock)), 980)
  assert.equal(Math.round(markTimeFor('tab', 1.98, clock)), 980)
  assert.equal(Math.round(markTimeFor('demo', 1.98, clock)), 980 + SPEAKER_DELAY_MS)
  assert.equal(Math.round(markTimeFor('file', 1.98, clock)), 980 + SPEAKER_DELAY_MS)
})

test('the light\'s work per frame stays far inside the frame budget, with every queue full', () => {
  let state = start(IDLE)
  let at = 0
  const rounds = 4000
  const began = performance.now()
  for (let i = 0; i < rounds; i++) {
    at += 90 + (i % 7) * 40
    state = addKick(state, at, 0.8)
    state = step(state, at + 5).state
  }
  const perFrame = (performance.now() - began) / rounds
  // Five times the cost of a frame's step and kick, still under a tenth of the page's budget.
  assert.ok(perFrame * 5 < FRAME_BUDGET_MS / 10, `${perFrame.toFixed(4)} ms a frame`)
})
