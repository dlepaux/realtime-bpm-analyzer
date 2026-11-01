// Turns one real capture session per theme into the site's demo frames (RBA-58):
//   node scripts/process-extension-reel.ts <light session dir> <dark session dir>
// Each directory comes from rba-pro's e2e/demo-capture.mjs. Crops and scales only, never
// retouches, and refuses a session whose frames don't carry the extension's own reading.
// Needs ImageMagick's `magick` with WebP. Writes .vitepress/assets/extension/demo/ and
// .vitepress/tools/extension-reel-capture.ts, then prints the zoom's arithmetic for the PR.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  REEL_CAPTURE_HEIGHT,
  REEL_CROP_WIDTHS,
  REEL_PAGE,
  REEL_WIDE_WIDTHS,
  pickReelFrames,
  reelArithmetic,
  reelCrop,
  reelFile,
  reelProblems,
  reelSessionProblems,
  type ReelCapture,
  type ReelSession,
  type ReelTheme,
} from '../.vitepress/tools/extension-reel.ts'

// The video David's shot list names. Each session must be of it, and its licence is read
// back from the session, as the watch page gave it during the capture.
const VIDEO_ID = 'XHE-lwJZbEU'
const VIDEO = {
  url: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
  title: 'Elektron Digitakt Minijam - 2020-07-01',
  channel: 'Oscillator Sink',
} as const

const ROOT = new URL('../.vitepress/', import.meta.url).pathname
const OUT = join(ROOT, 'assets/extension/demo')
const WEBP_QUALITY = '82'
const MAX_FILE_BYTES = 250_000

function encode(source: string, geometry: string, width: number, output: string): void {
  execFileSync('magick', [
    source, '-crop', geometry, '+repage', '-resize', `${width}x`,
    '-quality', WEBP_QUALITY, '-define', 'webp:method=6', output,
  ])
  const bytes = statSync(output).size
  if (bytes > MAX_FILE_BYTES) throw new Error(`${output} is ${bytes} bytes, over ${MAX_FILE_BYTES}`)
}

type Plan = {
  readonly dir: string
  readonly theme: ReelTheme
  readonly picks: NonNullable<ReturnType<typeof pickReelFrames>>
  readonly licence: string
}

const PAGE_WIDTH = REEL_PAGE.width * REEL_PAGE.deviceScale
const PAGE_HEIGHT = REEL_PAGE.height * REEL_PAGE.deviceScale
const CAPTURE_HEIGHT = REEL_CAPTURE_HEIGHT * REEL_PAGE.deviceScale

// The arithmetic only reads constants, so the real files have to match them.
function pixelProblem(source: string): string | null {
  const size = execFileSync('magick', ['identify', '-format', '%w %h', source], { encoding: 'utf8' })
  const [width = 0, height = 0] = size.trim().split(' ').map(Number)
  return width === PAGE_WIDTH && height >= CAPTURE_HEIGHT ? null : `${source} is ${width}x${height}, not ${PAGE_WIDTH} wide and ${CAPTURE_HEIGHT} or taller`
}

function planSession(dir: string, theme: ReelTheme): Plan {
  const session = JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8')) as ReelSession
  const picks = pickReelFrames(session)
  if (!picks) throw new Error(`${dir}: no listening, settling and stable frames with a real reading on a playing video`)
  const problems = [
    ...reelSessionProblems(session, VIDEO_ID),
    ...picks.flatMap(({ file }) => pixelProblem(join(dir, file)) ?? []),
  ]
  if (problems.length > 0) throw new Error(`${dir}:\n${problems.join('\n')}`)
  return { dir, theme, picks, licence: session.licence ?? '' }
}

function encodeSession({ dir, theme, picks }: Plan): void {
  const page = `${PAGE_WIDTH}x${PAGE_HEIGHT}+0+0`
  // The same view the camera lands on: the player's top right corner.
  const { x, y, width, height } = reelCrop()
  const scale = REEL_PAGE.deviceScale
  const crop = `${Math.round(width * scale)}x${Math.round(height * scale)}+${Math.round(x * scale)}+${Math.round(y * scale)}`
  picks.forEach(({ frame, file }) => {
    const source = join(dir, file)
    for (const w of REEL_CROP_WIDTHS) encode(source, crop, w, join(OUT, reelFile(theme, frame.step, w)))
    if (frame.step !== 'listening') return
    for (const w of REEL_WIDE_WIDTHS) encode(source, page, w, join(OUT, reelFile(theme, 'wide', w)))
  })
}

function main(): void {
  const [lightDir, darkDir] = process.argv.slice(2)
  if (!lightDir || !darkDir) throw new Error('usage: process-extension-reel.ts <light session dir> <dark session dir>')
  const light = planSession(lightDir, 'light')
  const dark = planSession(darkDir, 'dark')
  const capture: ReelCapture = {
    video: { ...VIDEO, licence: dark.licence },
    bpm: dark.picks.at(-1)?.frame.bpm ?? '',
    frames: { light: light.picks.map(({ frame }) => frame), dark: dark.picks.map(({ frame }) => frame) },
  }
  const problems = reelProblems(capture)
  if (problems.length > 0) throw new Error(problems.join('\n'))
  // A refused capture leaves the frames alone; an accepted one leaves nothing stale to publish.
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  encodeSession(light)
  encodeSession(dark)
  writeFileSync(join(ROOT, 'tools/extension-reel-capture.ts'), [
    '// Written by docs/scripts/process-extension-reel.ts from real capture sessions.',
    "import type { ReelCapture } from './extension-reel'",
    '',
    `export const REEL_CAPTURE: ReelCapture | null = ${JSON.stringify(capture, null, 2)}`,
    '',
  ].join('\n'))
  console.log(reelArithmetic())
}

main()
