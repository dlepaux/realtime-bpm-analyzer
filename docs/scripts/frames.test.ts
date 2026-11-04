// Run with `npm test` (node --test, Node's own type stripping; no test framework).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  FRAME_RATES,
  MAX_FPS,
  framesPerBeat,
  framesPerBeats,
  decimalFraction,
  driftFraction,
  formatFrames,
  framesFraction,
  isWhole,
  parseFps,
  roundingDrift,
  type Fraction,
} from '../.vitepress/tools/frames.ts'

const close = (actual: number, expected: number, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} is not ${expected}`)

test('framesPerBeat: 120 BPM is half a second, so 12 frames at 24 fps and 30 at 60', () => {
  close(framesPerBeat(120, 24), 12)
  close(framesPerBeat(120, 25), 12.5)
  close(framesPerBeat(120, 60), 30)
  close(framesPerBeat(60, 30), 30)
})

test('framesPerBeat: NTSC rates use the exact fraction, not the label', () => {
  close(framesPerBeat(120, 24_000 / 1001), 12_000 / 1001)
  assert.ok(!isWhole(framesFraction(120, FRAME_RATES[3]!.exact, 1)))
  assert.ok(isWhole(framesFraction(120, FRAME_RATES[1]!.exact, 1)))
})

test('framesPerBeats: a 4/4 bar at 128 BPM and 25 fps is 46.875 frames', () => {
  close(framesPerBeats(128, 25, 4), 46.875)
  close(framesPerBeats(120, 24, 3), 36)
})

test('roundingDrift: a whole count has no drift', () => {
  const drift = roundingDrift(48, 24)
  assert.equal(drift.rounded, 48)
  close(drift.frames, 0)
  close(drift.ms, 0)
})

test('roundingDrift: cutting every 47 frames for 46.875 falls an eighth of a frame late', () => {
  const drift = roundingDrift(46.875, 25)
  assert.equal(drift.rounded, 47)
  close(drift.frames, 0.125)
  close(drift.ms, 5)
})

test('roundingDrift: rounding down gives a negative drift, and never zero frames', () => {
  const drift = roundingDrift(12.4, 24)
  assert.equal(drift.rounded, 12)
  close(drift.frames, -0.4)
  assert.equal(roundingDrift(0.3, 24).rounded, 1)
})

test('FRAME_RATES: the eight common rates, in order', () => {
  assert.deepEqual(FRAME_RATES.map((rate) => rate.label), ['23.976', '24', '25', '29.97', '30', '50', '59.94', '60'])
  close(FRAME_RATES[3]!.fps, 29.97002997002997)
})

test('parseFps: labels map to the exact rate, plain numbers pass, the rest is refused', () => {
  close(parseFps('23.976')!, 24_000 / 1001)
  close(parseFps(' 59.94 ')!, 60_000 / 1001)
  assert.equal(parseFps('48'), 48)
  assert.equal(parseFps('12.5'), 12.5)
  assert.equal(parseFps(''), null)
  assert.equal(parseFps('abc'), null)
  assert.equal(parseFps('0'), null)
  assert.equal(parseFps('-24'), null)
  assert.equal(parseFps(String(MAX_FPS + 1)), null)
  assert.equal(parseFps('Infinity'), null)
})

test('parseFps: a preset written another way is the preset, so it never adds a duplicate row (RBA-124)', () => {
  assert.equal(parseFps('29.970'), FRAME_RATES[3]!.fps)
  assert.equal(parseFps('23.9760'), FRAME_RATES[0]!.fps)
  assert.equal(parseFps('59.940'), FRAME_RATES[6]!.fps)
  assert.equal(parseFps('25.0'), 25)
  assert.equal(parseFps('29.9'), 29.9)
})

test('the chart on the BPM to frames page matches framesPerBeat', () => {
  const page = readFileSync(new URL('../bpm-to-frames.md', import.meta.url), 'utf8')
  const lines = page.split('\n').filter((line) => line.startsWith('| '))
  const header = lines[0]!.split('|').slice(2, -1).map((cell) => cell.trim())
  assert.deepEqual(header, FRAME_RATES.map((rate) => rate.label))
  const rows = lines.slice(1)
  assert.ok(rows.length > 10, 'the chart moved')
  for (const row of rows) {
    const [bpm, ...cells] = row.split('|').slice(1, -1).map((cell) => Number(cell.trim()))
    FRAME_RATES.forEach((rate, i) => {
      assert.equal(cells[i], Number(framesPerBeat(bpm!, rate.fps).toFixed(2)), `${bpm} BPM at ${rate.label}`)
    })
  }
})

const rate = (label: string) => FRAME_RATES.find((r) => r.label === label)!.exact
const show = (bpm: number, fps: Fraction, beats = 1) => formatFrames(framesFraction(bpm, fps, beats))

test('formatFrames: the whole value when it ends within 6 decimals, otherwise 3 decimals', () => {
  assert.equal(show(128, rate('25')), '11.71875')
  assert.equal(show(128, rate('25'), 4), '46.875')
  assert.equal(show(120, rate('24')), '12')
  assert.equal(show(100, rate('24')), '14.4')
  assert.equal(formatFrames({ num: 1n, den: 8n }), '0.125')
  // NTSC rates and thirds never end: 3 decimals, trailing zeros dropped.
  assert.equal(show(120, rate('23.976')), '11.988')
  assert.equal(show(90, rate('25')), '16.667')
  assert.equal(show(120, rate('29.97')), '14.985')
  assert.equal(formatFrames({ num: 1234567n, den: 10_000_000n }), '0.123')
})

test('formatFrames: a value that repeats past 6 decimals is not shown as exact', () => {
  // 9000000/111111 is 81.000081000081…: a float tolerance took it for 81.000081.
  assert.equal(show(111, rate('29.97'), 5), '81')
  // 23.146604… repeating, not 23.146604.
  assert.equal(show(62.15, rate('23.976')), '23.147')
})

test('decimalFraction: the number as typed, so 47.952 is 47952/1000 and not a float', () => {
  assert.deepEqual(decimalFraction(47.952), { num: 47952n, den: 1000n })
  assert.deepEqual(decimalFraction(62.15), { num: 6215n, den: 100n })
  assert.deepEqual(decimalFraction(48), { num: 48n, den: 1n })
  assert.deepEqual(decimalFraction(1e-7), { num: 1n, den: 10_000_000n })
  assert.throws(() => decimalFraction(Number.NaN))
  assert.throws(() => decimalFraction(-1))
})

test('driftFraction: the exact distance to the rounded count, never rounding to zero frames', () => {
  assert.deepEqual(driftFraction(framesFraction(128, rate('25'), 4)), { num: 1n, den: 8n })
  assert.equal(formatFrames(driftFraction(framesFraction(120, rate('29.97'), 4))), '0.06')
  assert.deepEqual(driftFraction({ num: 3n, den: 10n }), { num: 7n, den: 10n })
  assert.ok(isWhole(driftFraction(framesFraction(120, rate('24'), 4))))
})

// An independent reference: n/d ends within 6 decimals when, reduced, its denominator is
// 2^a 5^b with a and b at most 6.
function endsWithinSix(num: bigint, den: bigint): boolean {
  const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : gcd(b, a % b))
  let d = den / gcd(num, den)
  let twos = 0
  let fives = 0
  while (d % 2n === 0n) { d /= 2n; twos++ }
  while (d % 5n === 0n) { d /= 5n; fives++ }
  return d === 1n && twos <= 6 && fives <= 6
}

test('formatFrames: a grid of tempos, rates and bar lengths against exact BigInt fractions', () => {
  const rates = [...FRAME_RATES.map((r) => r.exact), decimalFraction(48), decimalFraction(12.5), decimalFraction(47.952)]
  let cases = 0
  for (const fps of rates) {
    for (let hundredths = 2000; hundredths <= 30_000; hundredths += 7) {
      for (const beats of [1, 3, 4, 5, 7, 16]) {
        const num = fps.num * 6000n * BigInt(beats)
        const den = fps.den * BigInt(hundredths)
        const shown = formatFrames(framesFraction(hundredths / 100, fps, beats))
        const [whole, decimals = ''] = shown.split('.')
        const digits = BigInt(`${whole}${decimals}`)
        const scale = 10n ** BigInt(decimals.length)
        const label = `${hundredths / 100} BPM, ${beats} beats, ${fps.num}/${fps.den} fps: ${shown}`
        if (endsWithinSix(num, den)) {
          assert.equal(digits * den, num * scale, label)
        } else {
          assert.ok(decimals.length <= 3, label)
          // Within half a thousandth: |shown - n/d| <= 0.0005, on integers.
          const error = digits * 1000n * den / scale - num * 1000n
          assert.ok((error < 0n ? -error : error) * 2n <= den, label)
        }
        cases++
      }
    }
  }
  assert.ok(cases > 100_000)
})
