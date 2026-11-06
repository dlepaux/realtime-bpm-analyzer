// What the demo's first frame needs (RBA-58): its pages, tempos and drawn shapes. It ships to every
// visitor, phones included, so the motion lives apart in extension-scenes-timeline.ts, which only a
// computer that plays the demo downloads. Pure and import-free so `npm test` can read both.

export const TEMPO_RANGE = { min: 90, max: 180 } as const

export type SceneId = 'video' | 'music' | 'waveform'

export type Scene = {
  readonly id: SceneId
  /** The tempo the overlay ends on, and the one the picture beats at. */
  readonly bpm: number
  /** The first reading while settling. Real readings drift before they hold. */
  readonly firstReading: number
  /**
   * Where the overlay's top right corner sits, in the scene's units from the stage's top right.
   * The video is the real overlay's player mode, 12 px in from the player's corner. The other two
   * are its dock mode, in the play bar, as on YouTube Music's bar and SoundCloud's.
   */
  readonly anchor: { readonly right: number; readonly top: number }
}

/** The stage's size in scene units. One unit is one CSS pixel of the real overlay, enlarged. */
export const STAGE = { width: 520, height: 343 } as const

export const SCENES: readonly [Scene, Scene, Scene] = [
  { id: 'video', bpm: 128, firstReading: 125, anchor: { right: 160, top: 86 } },
  { id: 'music', bpm: 100, firstReading: 98, anchor: { right: 150, top: 296 } },
  { id: 'waveform', bpm: 140, firstReading: 137, anchor: { right: 18, top: 296 } },
]

// The distinct numbers the overlay shows, for markup: each is a layer that fades in and out.
export const READINGS: readonly number[] = [
  ...new Set(SCENES.flatMap((scene) => [scene.firstReading, scene.bpm])),
]

/** The overlay's position, as a share of the full-stage layer it moves. */
export function anchorTransform({ right, top }: Scene['anchor']): string {
  const x = (-100 * right) / STAGE.width
  const y = (100 * top) / STAGE.height
  return `translate(${x.toFixed(3)}%, ${y.toFixed(3)}%)`
}

// A small seeded generator, so the server and the browser draw the same shapes.
function noise(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 16807) % 2147483647
    return state / 2147483647
  }
}

/**
 * A packed row of people, on a `width` by 70 canvas, as one filled path: shoulders close enough to
 * make one mass, heads above it, and some arms in the air. As one path it takes a rim of light with
 * `paint-order: stroke`, whose inner edges the fill covers. Every shape winds clockwise, or an overlap
 * would cancel out and punch a hole.
 */
export function crowdPath(seed: number, width: number): string {
  const random = noise(seed)
  const n = (value: number) => value.toFixed(1)
  const circle = (x: number, y: number, r: number) => `M${n(x - r)} ${n(y)}a${r} ${r} 0 1 1 ${2 * r} 0a${r} ${r} 0 1 1-${2 * r} 0Z`
  const arm = (x: number, y: number, tipX: number, tipY: number) =>
    `M${n(x - 4.5)} ${n(y)}Q${n((x + tipX) / 2 - 3)} ${n((y + tipY) / 2 + 3)} ${n(tipX - 1.6)} ${n(tipY)}h3.2Q${n((x + tipX) / 2 + 3)} ${n((y + tipY) / 2 + 3)} ${n(x + 4.5)} ${n(y)}Z`
  const parts: string[] = []
  for (let x = -8; x < width + 16; x += 19 + random() * 8) {
    const head = 30 + random() * 14
    const top = head + 8
    parts.push(circle(x, head, 7.5), `M${n(x - 17)} 70V${n(top + 9)}Q${n(x - 16)} ${n(top)} ${n(x - 5)} ${n(top)}H${n(x + 5)}Q${n(x + 16)} ${n(top)} ${n(x + 17)} ${n(top + 9)}V70Z`)
    const raised = random()
    const lean = (random() - 0.4) * 24
    const reach = head - 16 - random() * 13
    if (raised > 0.62) parts.push(arm(x + 11, top + 8, x + 11 + lean, reach))
    if (raised > 0.86) parts.push(arm(x - 11, top + 8, x - 11 - lean, reach + 4))
  }
  return parts.join('')
}

/** A track's waveform, mirrored around nothing: heights only, as one path of bars. */
export function waveformPath(count: number, seed: number, width = 3, height = 60): string {
  const random = noise(seed)
  const parts: string[] = []
  for (let index = 0; index < count; index += 1) {
    const phrase = 0.5 + 0.35 * Math.sin(index / 7.3) * Math.sin(index / 23)
    const hitBar = index % 4 === 0 ? 0.28 : 0
    const value = Math.min(1, Math.max(0.1, phrase + hitBar + (random() - 0.5) * 0.3))
    const barHeight = value * height
    parts.push(`M${index * width} ${(height - barHeight).toFixed(1)}h${width - 1}V${height}h-${width - 1}Z`)
  }
  return parts.join('')
}

/** The drawn pages' controls, on a 24 by 24 canvas. Plain shapes, nobody's icon set. */
export const ICONS = {
  back: 'M15 5l1.5 1.5L11 12l5.5 5.5L15 19l-7-7z',
  forward: 'M9 5L7.5 6.5 13 12l-5.5 5.5L9 19l7-7z',
  pause: 'M7 5h4v14H7zM13 5h4v14h-4z',
  previous: 'M18 5L8 12l10 7zM5 5h2v14H5z',
  next: 'M6 5l10 7-10 7zM17 5h2v14h-2z',
  volume: 'M4 9v6h4l5 4V5L8 9zM15.5 8.5a5 5 0 0 1 0 7l-1-1a3.6 3.6 0 0 0 0-5z',
  expand: 'M5 5h5v2H7v3H5zM14 5h5v5h-2V7h-3zM5 14h2v3h3v2H5zM17 14h2v5h-5v-2h3z',
  search: 'M10 4a6 6 0 1 0 3.5 10.9l4.8 4.8 1.4-1.4-4.8-4.8A6 6 0 0 0 10 4zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8z',
  menu: 'M4 6h16v2H4zM4 11h16v2H4zM4 16h16v2H4z',
} as const

/** What each page's address bar reads. Reserved example domains, so it can't be anyone's site. */
export const ADDRESSES: Readonly<Record<SceneId, string>> = {
  video: 'video.example/watch/afterglow-engine',
  music: 'music.example/now-playing',
  waveform: 'audio.example/low-harbour/saltwater-static',
}
