// The demo's motion as data: every animation as keyframes, so `npm test` can hold it to the rules
// that keep it honest and cheap: a picture that beats at the number shown, and only compositor
// properties. extension-scenes-player.ts plays it, and nothing else imports it, so a phone never
// downloads it.
import { READINGS, SCENES, anchorTransform, type Scene, type SceneId } from './extension-scenes.ts'

// In seconds. The opening holds the first frame's reading long enough to read it, then each page
// gets the overlay's whole story. Real readings take longer, which the caption says.
const OPENING = 0.7
const MOVE = 0.5
const LISTEN = 0.9
const SETTLE = 1.1
// The number is the payoff, so the stable reading gets as long as the wait for it (Peak-End).
const STABLE = 1.2
const FINAL_HOLD = 1.2

export type Visit = {
  readonly scene: Scene
  /** When the page starts to arrive, when it is fully there, and when it starts to leave. */
  readonly enter: number
  readonly arrived: number
  readonly leave: number
  /** When the reading appears and when it turns stable. */
  readonly reading: number
  readonly stable: number
}

const [VIDEO, MUSIC, WAVEFORM] = SCENES

/** The sequence: the video page already reading, then the music page, the waveform page, and back. */
export function visits(): readonly Visit[] {
  const opening: Visit = { scene: VIDEO, enter: 0, arrived: 0, leave: OPENING, reading: 0, stable: 0 }
  let enter = OPENING
  const later = [MUSIC, WAVEFORM, VIDEO].map((scene, index) => {
    const arrived = enter + MOVE
    const reading = arrived + LISTEN
    const stable = reading + SETTLE
    const leave = stable + (index === 2 ? FINAL_HOLD : STABLE)
    const visit: Visit = { scene, enter, arrived, leave, reading, stable }
    enter = leave
    return visit
  })
  return [opening, ...later]
}

/** The whole sequence's length, in seconds. */
export const totalSeconds = (): number => visits().at(-1)?.leave ?? 0

export const beatSeconds = (bpm: number): number => 60 / bpm

/** A keyframe of the demo: only what the compositor can run without touching layout or paint. */
export type Frame = {
  readonly offset: number
  readonly transform?: string
  readonly opacity?: number
  readonly easing?: string
}

export type Track = {
  readonly target: string
  readonly frames: readonly Frame[]
}

/** Overlay widths, in ems of the pill's 14 px text, measured in the visitor's own font. */
export type PillWidths = { readonly listening: number; readonly settling: number; readonly stable: number }

// What the overlay does as its text changes, in ems of its 14 px text: its caption adds 4 px of
// height, and its button re-centres by half of that. Taken from the real layout of view.ts.
const LISTENING_DROP = 4 / 14
const CLOSE_RISE = 2 / 14
const BAR_RISE = 4 / 14
const LISTENING_HEIGHT = 38 / 42
// The progress bar is inset 12 px each side.
const INSET = 24 / 14
const FADE = 0.12
// The real overlay replaces its number outright, and a slow fade would smear two numbers together.
const SWAP = 0.03
const MOVE_EASING = 'cubic-bezier(0.65, 0, 0.25, 1)'

type Point = readonly [seconds: number, value: string | number, easing?: string]

/** Holds each value until the next point's `ramp` before it, then eases across the ramp. */
function holds(property: 'transform' | 'opacity', points: readonly Point[], ramp: number, total: number): Frame[] {
  const frames: Frame[] = []
  const add = (seconds: number, value: string | number, easing?: string) => {
    const frame = { offset: Math.min(1, Math.max(0, seconds / total)), [property]: value, ...(easing ? { easing } : {}) }
    frames.push(frame as Frame)
  }
  points.forEach(([seconds, value, easing], index) => {
    if (index > 0) add(seconds - ramp, points[index - 1]?.[1] ?? value, easing)
    add(seconds, value)
  })
  add(total, points.at(-1)?.[1] ?? 0)
  return frames
}

const fadeTrack = (target: string, points: readonly Point[], total: number): Track =>
  ({ target, frames: holds('opacity', points, FADE, total) })

const moveTrack = (target: string, points: readonly Point[], total: number, ramp = 0.25): Track =>
  ({ target, frames: holds('transform', points, ramp, total) })

// The pages push each other sideways, like swiping between tabs: nothing overlaps, so no page ever
// ghosts through another, and the overlay crossing over the top is the one thing that stays, which
// is what the transition is there to show. A page waits off stage, opaque, until its turn.
function pageTracks(all: readonly Visit[], total: number): Track[] {
  const at = (seconds: number, x: number, easing?: string): Frame => ({
    offset: seconds / total,
    opacity: 1,
    transform: `translateX(${x}%)`,
    ...(easing ? { easing } : {}),
  })
  return SCENES.map((scene) => {
    const frames: Frame[] = [at(0, scene === VIDEO ? 0 : 100)]
    for (const visit of all) {
      if (visit.scene !== scene) continue
      if (visit.enter > 0) {
        // A page coming back jumps from the far side to the near one while off stage.
        frames.push(at(visit.enter - 0.01, frames.at(-1)?.transform === 'translateX(-100%)' ? -100 : 100, 'step-end'))
        frames.push(at(visit.enter, 100, MOVE_EASING), at(visit.arrived, 0))
      }
      if (visit.leave < total) frames.push(at(visit.leave, 0, MOVE_EASING), at(visit.leave + MOVE, -100))
    }
    frames.push(at(total, scene === VIDEO ? 0 : -100))
    return { target: `.ext-scene[data-scene='${scene.id}']`, frames }
  })
}

// The address bar follows the page, changing halfway through the push.
function addressTracks(all: readonly Visit[], total: number): Track[] {
  return SCENES.map((scene) => {
    const points: Point[] = [[0, scene === VIDEO ? 1 : 0]]
    for (const visit of all.slice(1)) points.push([visit.enter + MOVE / 2, visit.scene === scene ? 1 : 0])
    return fadeTrack(`.ext-url[data-scene='${scene.id}']`, points, total)
  })
}

// The waveform's played part grows as the track plays: its clip moves right while the bars inside
// move back by the same amount, which reveals them with transforms alone.
const FIRST_SHARE = 0.4
const LAST_SHARE = 0.5

function waveformPlayedTracks(all: readonly Visit[], total: number): Track[] {
  const visit = all.find((candidate) => candidate.scene === WAVEFORM)
  if (!visit) return []
  const hidden = (share: number) => (1 - share) * 100
  const frames = (sign: number): Frame[] => [
    { offset: 0, transform: `translateX(${sign * hidden(FIRST_SHARE)}%)` },
    { offset: visit.enter / total, transform: `translateX(${sign * hidden(FIRST_SHARE)}%)`, easing: 'linear' },
    { offset: visit.leave / total, transform: `translateX(${sign * hidden(LAST_SHARE)}%)` },
    { offset: 1, transform: `translateX(${sign * hidden(LAST_SHARE)}%)` },
  ]
  return [
    { target: '.wav-played-clip', frames: frames(-1) },
    { target: '.wav-played-inner', frames: frames(1) },
    {
      target: '.wav-progress b',
      frames: [
        { offset: 0, transform: `scaleX(${FIRST_SHARE})` },
        { offset: visit.enter / total, transform: `scaleX(${FIRST_SHARE})`, easing: 'linear' },
        { offset: visit.leave / total, transform: `scaleX(${LAST_SHARE})` },
        { offset: 1, transform: `scaleX(${LAST_SHARE})` },
      ],
    },
  ]
}

// The overlay's own story on each visit. The moments come from view.ts: dots and a filling grey
// line, then a number under which the caption reads settling, then stable and green.
function overlayStateTracks(all: readonly Visit[], total: number): Track[] {
  const later = all.slice(1)
  const dots: Point[] = [[0, 0]]
  const settling: Point[] = [[0, 0]]
  const stable: Point[] = [[0, 1]]
  const low: Point[] = [[0, 0]]
  const medium: Point[] = [[0, 0]]
  const fill: Frame[] = [{ offset: 0, transform: 'scaleX(1)' }]
  for (const visit of later) {
    const reset = visit.enter + MOVE / 2
    // The old number has gone before the dots arrive, so the two never ghost through each other.
    dots.push([reset + FADE, 1], [visit.reading, 0])
    settling.push([visit.reading, 1], [visit.stable, 0])
    stable.push([reset, 0], [visit.stable, 1])
    low.push([reset, 1], [visit.reading, 0])
    medium.push([visit.reading, 1], [visit.stable, 0])
    // It empties at once on a new page, then grows steadily until the first number.
    fill.push(
      { offset: reset / total, transform: 'scaleX(1)' },
      { offset: (reset + 0.1) / total, transform: 'scaleX(0)', easing: 'cubic-bezier(0.25, 0.6, 0.45, 1)' },
      { offset: visit.reading / total, transform: 'scaleX(1)' },
    )
  }
  return [
    fadeTrack('.dots', dots, total),
    fadeTrack(`.hint[data-stability='settling']`, settling, total),
    fadeTrack(`.hint[data-stability='stable']`, stable, total),
    fadeTrack(`.ext-fill-layer[data-level='low']`, low, total),
    fadeTrack(`.ext-fill-layer[data-level='medium']`, medium, total),
    { target: '.ext-fill-track', frames: [...fill, { offset: 1, transform: 'scaleX(1)' }] },
  ]
}

function readingTracks(all: readonly Visit[], total: number): Track[] {
  return READINGS.map((reading) => {
    const points: Point[] = [[0, reading === VIDEO.bpm ? 1 : 0]]
    all.slice(1).forEach((visit, index) => {
      const midpoint = (visit.reading + visit.stable) / 2
      // Whatever the page before ended on goes when the overlay restarts for this one.
      if (reading === all[index]?.scene.bpm) points.push([visit.enter + MOVE / 2, 0])
      if (reading === visit.scene.firstReading) points.push([visit.reading, 1], [midpoint, 0])
      if (reading === visit.scene.bpm) points.push([midpoint, 1])
    })
    return { target: `.num[data-reading='${reading}']`, frames: holds('opacity', points, SWAP, total) }
  })
}

// Its width and height as the text changes. The real pill reflows; here two overlapping caps make
// the same shape with transforms alone, so its rounded ends never stretch.
function overlayShapeTracks(all: readonly Visit[], widths: PillWidths, total: number): Track[] {
  const later = all.slice(1)
  const shift = (width: number) => (widths.stable - width).toFixed(4)
  const scale = (width: number) => ((width - INSET) / (widths.stable - INSET)).toFixed(4)
  const AT_REST = 'translateX(0em)'
  const stack: Point[] = [[0, AT_REST]]
  const edge: Point[] = [[0, AT_REST]]
  const track: Point[] = [[0, 'translateY(0em) scaleX(1)']]
  const reading: Point[] = [[0, 'translateY(0em)']]
  const close: Point[] = [[0, 'translateY(0em)']]
  const height: Point[] = [[0, 'scaleY(1)']]
  for (const visit of later) {
    const reset = visit.enter + MOVE / 2
    const atWidth = (width: number): string => `translateX(${shift(width)}em)`
    stack.push([reset, atWidth(widths.listening)], [visit.reading, atWidth(widths.settling)], [visit.stable, AT_REST])
    edge.push([reset, atWidth(widths.listening)], [visit.reading, atWidth(widths.settling)], [visit.stable, AT_REST])
    track.push(
      [reset, `translateY(${(-BAR_RISE).toFixed(4)}em) scaleX(${scale(widths.listening)})`],
      [visit.reading, `translateY(0em) scaleX(${scale(widths.settling)})`],
      [visit.stable, 'translateY(0em) scaleX(1)'],
    )
    reading.push([reset, `translateY(${LISTENING_DROP.toFixed(4)}em)`], [visit.reading, 'translateY(0em)'])
    close.push([reset, `translateY(${(-CLOSE_RISE).toFixed(4)}em)`], [visit.reading, 'translateY(0em)'])
    height.push([reset, `scaleY(${LISTENING_HEIGHT.toFixed(4)})`], [visit.reading, 'scaleY(1)'])
  }
  return [
    moveTrack('.stack', stack, total),
    moveTrack('.ext-pill-edge', edge, total),
    moveTrack('.progress', track, total),
    moveTrack('.reading', reading, total),
    moveTrack('.close', close, total),
    moveTrack('.ext-pill-shell', height, total),
  ]
}

function arrivalTracks(all: readonly Visit[], total: number): Track[] {
  const position: Frame[] = [{ offset: 0, transform: anchorTransform(VIDEO.anchor) }]
  const tab: Frame[] = [{ offset: 0, transform: 'translateX(0%)' }]
  for (const visit of all.slice(1)) {
    const index = SCENES.indexOf(visit.scene)
    const before = all[all.indexOf(visit) - 1]
    if (!before) continue
    position.push({ offset: visit.enter / total, transform: anchorTransform(before.scene.anchor), easing: MOVE_EASING })
    position.push({ offset: visit.arrived / total, transform: anchorTransform(visit.scene.anchor) })
    tab.push({ offset: visit.enter / total, transform: `translateX(${SCENES.indexOf(before.scene) * 100}%)`, easing: MOVE_EASING })
    tab.push({ offset: visit.arrived / total, transform: `translateX(${index * 100}%)` })
  }
  position.push({ offset: 1, transform: anchorTransform(VIDEO.anchor) })
  tab.push({ offset: 1, transform: 'translateX(0%)' })
  return [{ target: '.ext-sw-pos', frames: position }, { target: '.ext-tab-active', frames: tab }]
}

/** Every once-through animation, over one shared duration: `totalSeconds()`. */
export function sequenceTracks(widths: PillWidths): Track[] {
  const all = visits()
  const total = totalSeconds()
  return [
    ...pageTracks(all, total),
    ...addressTracks(all, total),
    ...waveformPlayedTracks(all, total),
    ...arrivalTracks(all, total),
    ...overlayStateTracks(all, total),
    ...readingTracks(all, total),
    ...overlayShapeTracks(all, widths, total),
  ]
}

/** view.ts's `rba-pulse`, at its 1.2 s with its 0.2 s stagger. -3 px on the dot's 16 px text. */
export const DOT_PULSE = {
  seconds: 1.2,
  stagger: 0.2,
  frames: [
    { offset: 0, transform: 'translateY(0)', opacity: 0.35, easing: 'ease-in-out' },
    { offset: 0.4, transform: 'translateY(-0.1875em)', opacity: 1, easing: 'ease-in-out' },
    { offset: 0.8, transform: 'translateY(0)', opacity: 0.35 },
    { offset: 1, transform: 'translateY(0)', opacity: 0.35 },
  ] satisfies readonly Frame[],
} as const

/** A scene's moving picture: a loop that lasts a whole number of beats. */
export type BeatLoop = {
  readonly target: string
  readonly beats: number
  readonly frames: readonly Frame[]
}

const hit = (from: string, to: string, opacityFrom = 1, opacityTo = 1): Frame[] => [
  { offset: 0, transform: from, opacity: opacityFrom, easing: 'cubic-bezier(0.1, 0.8, 0.3, 1)' },
  { offset: 0.14, transform: to, opacity: opacityTo, easing: 'cubic-bezier(0.3, 0, 0.5, 1)' },
  { offset: 1, transform: from, opacity: opacityFrom },
]

// A ring leaves the centre on the beat. Its rest pose is partway out, so a still has rings too.
const ring = (rest: number, restOpacity: number): Frame[] => [
  { offset: 0, transform: `scale(${rest})`, opacity: restOpacity, easing: 'linear' },
  { offset: 0.4, transform: 'scale(1.5)', opacity: 0, easing: 'step-end' },
  { offset: 0.41, transform: 'scale(0.42)', opacity: 0, easing: 'cubic-bezier(0.1, 0.8, 0.3, 1)' },
  { offset: 0.48, transform: 'scale(0.5)', opacity: 1, easing: 'linear' },
  { offset: 1, transform: `scale(${rest})`, opacity: restOpacity },
]

const sway = (degrees: number): Frame[] => [
  { offset: 0, transform: 'rotate(0deg)', easing: 'ease-in-out' },
  { offset: 0.25, transform: `rotate(${degrees}deg)`, easing: 'ease-in-out' },
  { offset: 0.75, transform: `rotate(${-degrees}deg)`, easing: 'ease-in-out' },
  { offset: 1, transform: 'rotate(0deg)' },
]

const spin = (turn: number): Frame[] => [
  { offset: 0, transform: 'rotate(0deg)', easing: 'linear' },
  { offset: 1, transform: `rotate(${turn}deg)` },
]

const bounce = (distance: number): Frame[] => [
  { offset: 0, transform: 'translateY(0)', easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' },
  { offset: 0.3, transform: `translateY(${distance}%)`, easing: 'cubic-bezier(0.4, 0, 0.6, 1)' },
  { offset: 1, transform: 'translateY(0)' },
]

const drift = (x: number, y: number, scale = 1.06): Frame[] => [
  { offset: 0, transform: 'translate(0%, 0%) scale(1)', easing: 'ease-in-out' },
  { offset: 0.5, transform: `translate(${x}%, ${y}%) scale(${scale})`, easing: 'ease-in-out' },
  { offset: 1, transform: 'translate(0%, 0%) scale(1)' },
]

const barPulse = (peak: number): Frame[] => [
  { offset: 0, transform: `scaleY(${peak})`, easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' },
  { offset: 0.5, transform: 'scaleY(0.35)', easing: 'cubic-bezier(0.4, 0, 0.6, 1)' },
  { offset: 1, transform: `scaleY(${peak})` },
]

export const SCENE_LOOPS: Readonly<Record<SceneId, readonly BeatLoop[]>> = {
  video: [
    { target: '.vid-fan-l', beats: 16, frames: sway(13) },
    { target: '.vid-fan-r', beats: 16, frames: sway(-13) },
    { target: '.vid-fans', beats: 1, frames: [{ offset: 0, opacity: 1, easing: 'ease-out' }, { offset: 0.65, opacity: 0.62, easing: 'ease-in' }, { offset: 1, opacity: 1 }] },
    { target: '.vid-sun', beats: 1, frames: hit('scale(1)', 'scale(1.16)', 1, 1) },
    { target: '.vid-halo', beats: 1, frames: hit('scale(1)', 'scale(1.1)', 0.8, 1) },
    { target: '.vid-ring-1', beats: 2, frames: ring(0.92, 0.5) },
    { target: '.vid-ring-2', beats: 2, frames: ring(1.28, 0.3) },
    { target: '.vid-crowd-a', beats: 2, frames: bounce(-11) },
    { target: '.vid-crowd-b', beats: 1, frames: bounce(-8) },
  ],
  music: [
    { target: '.mus-wash-a', beats: 8, frames: drift(9, -6, 1.14) },
    { target: '.mus-wash-b', beats: 8, frames: drift(-8, 7, 1.1) },
    { target: '.mus-glow', beats: 1, frames: hit('scale(1)', 'scale(1.08)', 0.72, 1) },
    { target: '.mus-arcs-a', beats: 16, frames: spin(180) },
    { target: '.mus-arcs-b', beats: 16, frames: spin(-180) },
    { target: '.mus-sun', beats: 1, frames: hit('scale(1)', 'scale(1.12)') },
    { target: '.mus-art', beats: 1, frames: hit('scale(1)', 'scale(1.018)') },
    { target: '.mus-eq i:nth-child(1)', beats: 1, frames: barPulse(0.9) },
    { target: '.mus-eq i:nth-child(2)', beats: 0.5, frames: barPulse(0.6) },
    { target: '.mus-eq i:nth-child(3)', beats: 1, frames: barPulse(0.75) },
  ],
  waveform: [
    { target: '.wav-ribbon-a', beats: 8, frames: drift(14, 6, 1.1) },
    { target: '.wav-ribbon-b', beats: 8, frames: drift(-12, -7, 1.12) },
    { target: '.wav-flare', beats: 1, frames: hit('scale(1)', 'scale(1.14)', 0.55, 1) },
    { target: '.wav-bars-beat', beats: 1, frames: hit('scaleY(1)', 'scaleY(1.24)') },
    { target: '.wav-art-sea-a', beats: 2, frames: bounce(-7) },
    { target: '.wav-art-sea-b', beats: 1, frames: bounce(-9) },
    { target: '.wav-art-sea-c', beats: 2, frames: bounce(-5) },
    { target: '.wav-art-moon', beats: 1, frames: hit('scale(1)', 'scale(1.14)') },
  ],
}

export type LoopTiming = { readonly delay: number; readonly iterations: number; readonly iterationStart: number; readonly duration: number }

/**
 * How one loop runs across one visit: from the moment the page starts to arrive until it has gone,
 * with its phase set so a whole iteration ends right at the end. So when the demo finishes, every
 * layer is already at its rest pose, which is the still, and nothing jumps. The opening has the same
 * problem at the other end: it starts from the rest pose the visitor is already looking at.
 */
export function loopTiming(loop: BeatLoop, bpm: number, visit: Visit): LoopTiming {
  const end = visit.leave + (visit.leave < totalSeconds() ? MOVE : 0)
  const duration = loop.beats * beatSeconds(bpm)
  const iterations = (end - visit.enter) / duration
  const iterationStart = visit.enter === 0 ? 0 : (Math.ceil(iterations) - iterations) % 1
  return { delay: visit.enter, duration, iterations, iterationStart }
}

/** Seconds for the overlay's dots to pulse on a visit, in whole cycles of the real animation. */
export function dotTiming(visit: Visit, index: number): LoopTiming {
  const start = visit.enter + MOVE / 2 + index * DOT_PULSE.stagger
  return { delay: start, duration: DOT_PULSE.seconds, iterations: Math.max(1, (visit.reading - start) / DOT_PULSE.seconds), iterationStart: 0 }
}
