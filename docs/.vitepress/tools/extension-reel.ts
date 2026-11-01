// The demo on the extension's first screens: real frames of one real session of the
// extension on a real YouTube page, with the zoom added afterwards in CSS. Pure, so
// `npm test` can hold the numbers to David's limit: at the end of the zoom, on a 2x
// screen at the largest displayed size, no source pixel covers more than one device pixel.

/** Where the build publishes the frames, only once the switch is set. */
export const REEL_DIR = 'extension-demo'

/** The largest width the stage is ever shown at, in CSS pixels. extension.css caps it at this. */
export const REEL_MAX_DISPLAY_WIDTH = 760

/**
 * How far the camera moves in, towards the page's top right corner: the overlay sits at the
 * player's top right, and YouTube's masthead stays in view above it, which is what says
 * this is a page the visitor already knows. Past about 2 the video behind it turns mushy.
 */
export const REEL_ZOOM = 2

/**
 * What the demo shows of a capture: the page's CSS size and Chromium's device scale factor.
 * Captures are taller, at 960 x 660, to fit the window; the processing script keeps the top.
 */
export const REEL_PAGE = { width: 960, height: 610, deviceScale: 5 } as const

/** The widths the processing script writes, largest first. */
export const REEL_WIDE_WIDTHS = [1520, 800] as const
export const REEL_CROP_WIDTHS = [1520, 800] as const

export type ReelStep = 'listening' | 'settling' | 'stable'
export const REEL_STEPS: readonly ReelStep[] = ['listening', 'settling', 'stable']

export type ReelTheme = 'light' | 'dark'

/** One real frame: what the extension's overlay said when it was taken. */
export type ReelFrame = {
  readonly step: ReelStep
  /** The overlay's own bpm attribute at that moment, empty while it is listening. */
  readonly bpm: string
  /** Milliseconds after listening started. */
  readonly atMs: number
}

/** What a capture has to say about itself before it can be shown. */
export type ReelCapture = {
  readonly video: {
    readonly url: string
    readonly title: string
    readonly channel: string
    /** The licence as the watch page words it. */
    readonly licence: string
  }
  /** The reading the overlay shows on the last frame. Used in the alt text and caption. */
  readonly bpm: string
  readonly frames: Readonly<Record<ReelTheme, readonly ReelFrame[]>>
}

export type ReelArithmetic = {
  readonly sourceWidth: number
  readonly cropSourceWidth: number
  readonly cropFileWidth: number
  readonly devicePixelsAcross: number
  readonly sourcePixelsPerDevicePixel: number
  readonly filePixelsPerDevicePixel: number
  readonly largestAllowedZoom: number
}

/**
 * The numbers the limit depends on. At the zoom's end the crop fills the stage, so its
 * pixels are spread over the stage's device pixels. Both ratios must be at least 1: the
 * captured source, and the file actually served.
 */
export function reelArithmetic(
  page: { readonly width: number; readonly deviceScale: number } = REEL_PAGE,
  zoom: number = REEL_ZOOM,
  displayWidth: number = REEL_MAX_DISPLAY_WIDTH,
  cropFileWidth: number = REEL_CROP_WIDTHS[0],
  screenScale = 2,
): ReelArithmetic {
  const sourceWidth = page.width * page.deviceScale
  const cropSourceWidth = sourceWidth / zoom
  const devicePixelsAcross = displayWidth * screenScale
  return {
    sourceWidth,
    cropSourceWidth,
    cropFileWidth,
    devicePixelsAcross,
    sourcePixelsPerDevicePixel: cropSourceWidth / devicePixelsAcross,
    filePixelsPerDevicePixel: cropFileWidth / devicePixelsAcross,
    largestAllowedZoom: sourceWidth / devicePixelsAcross,
  }
}

// The caption says CC BY, so this accepts only that. A CC0 video would change both.
const CC_BY = /^Creative Commons Attribution( license|$)/

/** Why a capture can't be shown, or an empty list. `npm test` refuses a bad one. */
export function reelProblems(capture: ReelCapture): string[] {
  const problems: string[] = []
  const numbers = reelArithmetic()
  if (numbers.sourcePixelsPerDevicePixel < 1) problems.push('the source is upscaled at the end of the zoom')
  if (numbers.filePixelsPerDevicePixel < 1) problems.push('the served file is upscaled at the end of the zoom')
  if (!/^https:\/\/www\.youtube\.com\/watch\?v=/.test(capture.video.url)) problems.push('the video is not a youtube.com watch page')
  if (!CC_BY.test(capture.video.licence)) problems.push(`the licence "${capture.video.licence}" is not CC BY`)
  // The stage's label names one number, and both themes must show it.
  if (capture.frames.light.at(-1)?.bpm !== capture.bpm || capture.frames.dark.at(-1)?.bpm !== capture.bpm) {
    problems.push(`the themes' last frames don't both show ${capture.bpm}`)
  }
  for (const theme of ['light', 'dark'] as const) {
    const frames = capture.frames[theme]
    const steps = frames.map((frame) => frame.step)
    if (steps.join() !== REEL_STEPS.join()) problems.push(`${theme}: the frames are not listening, settling, stable`)
    const last = frames.at(-1)
    if (last && !/^\d{2,3}$/.test(last.bpm)) problems.push(`${theme}: the last frame has no real reading`)
    const times = frames.map((frame) => frame.atMs)
    if (times.some((time, index) => index > 0 && time <= (times[index - 1] ?? 0))) problems.push(`${theme}: the frames are not in the order they were taken`)
  }
  return problems
}

/** A session as e2e/demo-capture.mjs in rba-pro records it. */
export type ReelSession = {
  readonly id?: string
  readonly viewport?: { readonly width: number; readonly height: number }
  readonly scale?: number
  readonly outcome?: string
  readonly licence?: string | null
  readonly frames: readonly {
    readonly name: string
    readonly atMs?: number
    readonly before: { readonly bpm: string; readonly stability: string }
    readonly after?: { readonly bpm: string; readonly stability: string }
    readonly reading?: { readonly bpm: number | null } | null
    /** The video when the frame was taken: `t` is its position, in seconds. */
    readonly player?: { readonly t?: number; readonly paused?: boolean; readonly ad?: boolean }
  }[]
}

/** Why a session can't stand behind the caption and the arithmetic, or an empty list. */
export function reelSessionProblems(session: ReelSession, videoId: string): string[] {
  const problems: string[] = []
  if (session.id !== videoId) problems.push(`the session is of "${session.id}", not ${videoId}`)
  if (!CC_BY.test(session.licence ?? '')) problems.push(`the session's licence "${session.licence}" is not CC BY`)
  const { viewport, scale } = session
  if (viewport?.width !== REEL_PAGE.width || (viewport?.height ?? 0) < REEL_PAGE.height || scale !== REEL_PAGE.deviceScale) {
    problems.push(`the session was not captured at ${REEL_PAGE.width} wide, ${REEL_PAGE.height} or taller, at ${REEL_PAGE.deviceScale}x`)
  }
  return problems
}

type SessionFrame = ReelSession['frames'][number]

// The frame shows what the overlay said only if it said the same before and after the
// shot, and a number only if the extension's own last reading agrees with it. Stand-in
// frames from the capture's proof mode carry no reading, so they can't pass.
// The overlay keeps its last tempo through a stall, an error or an ad, so the number alone
// doesn't say the music was still playing: the video has to have moved on since the frame
// before. This is what keeps out the frames after YouTube stops an automated player.
function playerHolds(frame: SessionFrame, previous: SessionFrame | undefined): boolean {
  const { player } = frame
  if (player?.t === undefined || player.paused !== false || player.ad !== false) return false
  return previous?.player?.t === undefined || player.t > previous.player.t
}

function frameHolds(frame: SessionFrame, step: ReelStep): boolean {
  const { before, after, reading } = frame
  if (!after || before.stability !== step || after.stability !== step || before.bpm !== after.bpm) return false
  if (frame.atMs === undefined || frame.name.startsWith('proof-')) return false
  if (step === 'listening') return before.bpm === ''
  return /^\d+$/.test(before.bpm) && reading?.bpm != null && Math.round(reading.bpm) === Number(before.bpm)
}

/** The session's frames to show, with their files, or null if it has no honest set. */
export function pickReelFrames(session: ReelSession): { readonly frame: ReelFrame; readonly file: string }[] | null {
  const picks: { frame: ReelFrame; file: string }[] = []
  for (const step of REEL_STEPS) {
    const held = session.frames.filter((frame, index) => frameHolds(frame, step) && playerHolds(frame, session.frames[index - 1]))
    // The last stable frame, because the reading has had longest to settle by then.
    const pick = step === 'stable' ? held.at(-1) : held[0]
    if (pick?.atMs === undefined) return null
    picks.push({ file: pick.name, frame: { step, bpm: pick.before.bpm, atMs: pick.atMs } })
  }
  return picks
}

/** Whether a name is one `reelFile` can produce: all the dev server will read from disk. */
export function isReelFile(name: string): boolean {
  return /^(light|dark)-(wide|listening|settling|stable)-\d+\.webp$/.test(name)
}

/** The file name of a frame's picture. */
export function reelFile(theme: ReelTheme, layer: 'wide' | ReelStep, width: number): string {
  return `${theme}-${layer}-${width}.webp`
}
