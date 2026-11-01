// Turns one real capture session per theme into the site's demo frames (RBA-58):
//   node scripts/process-extension-reel.ts <light session dir> <dark session dir>
// Each directory comes from rba-pro's e2e/demo-capture.mjs. Crops and scales only, never
// retouches, and refuses a session whose frames don't carry the extension's own reading.
// Needs ImageMagick's `magick` with WebP. Writes .vitepress/assets/extension/demo/ and
// .vitepress/tools/extension-reel-capture.ts, then prints the zoom's arithmetic for the PR.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  REEL_CROP_WIDTHS,
  REEL_PAGE,
  REEL_WIDE_WIDTHS,
  REEL_ZOOM,
  pickReelFrames,
  reelArithmetic,
  reelFile,
  reelProblems,
  type ReelCapture,
  type ReelFrame,
  type ReelSession,
  type ReelTheme,
} from '../.vitepress/tools/extension-reel.ts'

// The video David's shot list names. Its licence is read back from the session, as the
// watch page gave it during the capture.
const VIDEO = {
  url: 'https://www.youtube.com/watch?v=zsifk9ucltQ',
  title: '80s Party',
  channel: 'Aries Beats',
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

function processSession(dir: string, theme: ReelTheme): { frames: ReelFrame[]; licence: string } {
  const session = JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8')) as ReelSession
  const picks = pickReelFrames(session)
  if (!picks) throw new Error(`${dir}: no listening, settling and stable frames with a real reading`)
  const scale = REEL_PAGE.deviceScale
  const width = REEL_PAGE.width * scale
  const height = REEL_PAGE.height * scale
  const cropWidth = Math.round(width / REEL_ZOOM)
  const cropHeight = Math.round(height / REEL_ZOOM)
  const page = `${width}x${height}+0+0`
  // The same view the camera lands on: the page's top right corner.
  const crop = `${cropWidth}x${cropHeight}+${width - cropWidth}+0`
  picks.forEach(({ frame, file }) => {
    const source = join(dir, file)
    for (const w of REEL_CROP_WIDTHS) encode(source, crop, w, join(OUT, reelFile(theme, frame.step, w)))
    if (frame.step !== 'listening') return
    for (const w of REEL_WIDE_WIDTHS) encode(source, page, w, join(OUT, reelFile(theme, 'wide', w)))
  })
  return { frames: picks.map(({ frame }) => frame), licence: session.licence ?? '' }
}

function main(): void {
  const [lightDir, darkDir] = process.argv.slice(2)
  if (!lightDir || !darkDir) throw new Error('usage: process-extension-reel.ts <light session dir> <dark session dir>')
  mkdirSync(OUT, { recursive: true })
  const light = processSession(lightDir, 'light')
  const dark = processSession(darkDir, 'dark')
  const capture: ReelCapture = {
    video: { ...VIDEO, licence: dark.licence },
    bpm: dark.frames.at(-1)?.bpm ?? '',
    frames: { light: light.frames, dark: dark.frames },
  }
  const problems = reelProblems(capture)
  if (problems.length > 0) throw new Error(problems.join('\n'))
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
