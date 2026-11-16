// The strobe's spectrogram (RBA-237): which analyser bin each row shows, the colours, and how far
// it scrolls each frame. The component shifts the canvas and paints one new column per pixel of
// time, so the main thread's work per frame is a copy and SPECTROGRAM_HEIGHT palette lookups.
// Pure, so node --test checks the mapping and the cost (scripts/spectrogram.test.ts).

/** The canvas's own pixels; CSS stretches them. Small on purpose: a phone paints it every frame. */
export const SPECTROGRAM_WIDTH = 480
export const SPECTROGRAM_HEIGHT = 96

/** 60 px a second: the canvas shows the last 8 s, so a breakdown and the drop fit on it. */
export const PX_PER_MS = 0.06

/**
 * The page's own main-thread work per frame (the light's step and the spectrogram), at most:
 * a quarter of a 60 Hz frame, leaving the rest to the browser's style, paint and the analyzer's
 * messages. Measured in Chromium with the CPU slowed 4 times, as a phone; see RBA-237's READY.
 */
export const FRAME_BUDGET_MS = 4

/** The rows' range: from under the kick's band to above the hi-hats' body. */
const MIN_HZ = 30
const MAX_HZ = 12_000

/** For each row, top first, the analyser bin it shows, on a log scale of frequency. */
export function rowBins(height: number, fftSize: number, sampleRate: number): Uint16Array {
  const binHz = sampleRate / fftSize
  const last = fftSize / 2 - 1
  const rows = new Uint16Array(height)
  for (let row = 0; row < height; row++) {
    const hz = MIN_HZ * (MAX_HZ / MIN_HZ) ** (1 - row / (height - 1))
    rows[row] = Math.min(last, Math.max(0, Math.round(hz / binHz)))
  }
  return rows
}

/** Black, through indigo and the brand's blue, to cyan and white. No red: the light's rule too. */
const STOPS: readonly [number, number, number, number][] = [
  [0, 0, 0, 0],
  [0.35, 26, 16, 80],
  [0.6, 58, 92, 255],
  [0.85, 95, 212, 255],
  [1, 255, 255, 255],
]

/** 256 RGBA colours, one per analyser level. */
export const PALETTE: Uint8ClampedArray = (() => {
  const palette = new Uint8ClampedArray(256 * 4)
  for (let level = 0; level < 256; level++) {
    const v = level / 255
    const upper = STOPS.findIndex(([at]) => at >= v)
    const [a0, r0, g0, b0] = STOPS[Math.max(0, upper - 1)] as [number, number, number, number]
    const [a1, r1, g1, b1] = STOPS[upper] as [number, number, number, number]
    const t = a1 === a0 ? 1 : (v - a0) / (a1 - a0)
    palette.set([r0 + (r1 - r0) * t, g0 + (g1 - g0) * t, b0 + (b1 - b0) * t, 255], level * 4)
  }
  return palette
})()

/** Paints one column, top row first, from the analyser's byte levels into `out` (RGBA). */
export function paintColumn(levels: Uint8Array, rows: Uint16Array, out: Uint8ClampedArray): void {
  for (let row = 0; row < rows.length; row++) {
    const from = (levels[rows[row] as number] as number) * 4
    const to = row * 4
    out[to] = PALETTE[from] as number
    out[to + 1] = PALETTE[from + 1] as number
    out[to + 2] = PALETTE[from + 2] as number
    out[to + 3] = 255
  }
}

/** Whole pixels to scroll for `elapsedMs`, with the fraction carried to the next frame. */
export function scrollPixels(elapsedMs: number, carry: number): { pixels: number; carry: number } {
  const exact = Math.max(0, elapsedMs) * PX_PER_MS + carry
  if (exact >= SPECTROGRAM_WIDTH) return { pixels: SPECTROGRAM_WIDTH, carry: 0 }
  const pixels = Math.floor(exact)
  return { pixels, carry: exact - pixels }
}

/** Where a kick heard `agoMs` ago sits now, in canvas pixels from the left. */
export function kickX(agoMs: number): number {
  return SPECTROGRAM_WIDTH - 1 - agoMs * PX_PER_MS
}
