// Run with `npm test`. The strobe's spectrogram: which analyser bin each row shows, the
// colours it paints, and its cost per frame. It runs beside the light on a phone, so the work each
// frame does on the main thread has a bound, asserted here on the code the page runs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isSaturatedRed } from '../.vitepress/tools/strobe.ts'
import {
  FRAME_BUDGET_MS,
  PALETTE,
  SPECTROGRAM_HEIGHT,
  paintColumn,
  rowBins,
  scrollPixels,
} from '../.vitepress/tools/spectrogram.ts'

test('rows map to bins on a log scale, low notes at the bottom, every bin in range', () => {
  const rows = rowBins(SPECTROGRAM_HEIGHT, 1024, 48_000)
  assert.equal(rows.length, SPECTROGRAM_HEIGHT)
  for (let i = 1; i < rows.length; i++) assert.ok((rows[i] as number) <= (rows[i - 1] as number), `row ${i} is not lower than the one above`)
  for (const bin of rows) assert.ok(bin >= 0 && bin < 512)
  // The kick's band, under 150 Hz, gets several rows, not one: that is where a kick shows.
  const binHz = 48_000 / 1024
  assert.ok(rows.filter((bin) => bin * binHz <= 150).length >= 8)
})

test('the palette has 256 colours from black, none of them a saturated red', () => {
  assert.equal(PALETTE.length, 256 * 4)
  assert.deepEqual([...PALETTE.slice(0, 3)], [0, 0, 0])
  for (let i = 0; i < 256; i++) {
    const hex = `#${[...PALETTE.slice(i * 4, i * 4 + 3)].map((c) => c.toString(16).padStart(2, '0')).join('')}`
    assert.equal(isSaturatedRed(hex), false, `${i}: ${hex}`)
  }
})

test('paintColumn writes one pixel per row, the louder the brighter', () => {
  const rows = rowBins(SPECTROGRAM_HEIGHT, 1024, 48_000)
  const data = new Uint8Array(512)
  data.fill(255, 0, 4)
  const out = new Uint8ClampedArray(SPECTROGRAM_HEIGHT * 4)
  paintColumn(data, rows, out)
  const bottom = out.slice((SPECTROGRAM_HEIGHT - 1) * 4)
  const top = out.slice(0, 4)
  assert.ok((bottom[0] as number) + (bottom[1] as number) + (bottom[2] as number) > 600, 'the loud low bins are bright')
  assert.deepEqual([...top], [0, 0, 0, 255], 'the silent top is black')
})

test('scrolling is in real time: pixels per ms, with the fraction carried to the next frame', () => {
  let carry = 0
  let total = 0
  for (let frame = 0; frame < 600; frame++) {
    const step = scrollPixels(1000 / 60, carry)
    carry = step.carry
    total += step.pixels
  }
  const expected = 10_000 * (scrollPixels(1000, 0).pixels / 1000)
  assert.ok(Math.abs(total - expected) <= 1, `${total} pixels in 10 s, expected ${expected}`)
  assert.equal(scrollPixels(5000, 0).pixels <= 480, true, 'a long pause scrolls at most one width')
})

test(`the spectrogram's own work per frame stays far under the ${FRAME_BUDGET_MS} ms budget`, () => {
  const rows = rowBins(SPECTROGRAM_HEIGHT, 1024, 48_000)
  const data = new Uint8Array(512).map((_, i) => (i * 37) % 256)
  const out = new Uint8ClampedArray(SPECTROGRAM_HEIGHT * 4)
  const times: number[] = []
  for (let frame = 0; frame < 2000; frame++) {
    const begin = performance.now()
    paintColumn(data, rows, out)
    times.push(performance.now() - begin)
  }
  times.sort((a, b) => a - b)
  const p99 = times[Math.floor(times.length * 0.99)] as number
  // A phone runs it about 5 times slower than CI's runner: the bound keeps that room.
  assert.ok(p99 * 5 < FRAME_BUDGET_MS / 4, `p99 ${p99.toFixed(4)} ms per column`)
})
