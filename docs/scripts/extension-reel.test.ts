// Run with `npm test`. The demo's limits: never upscaled at the end of the zoom, and never
// a frame without the extension's own reading.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { REEL_CAPTURE } from '../.vitepress/tools/extension-reel-capture.ts'
import {
  isReelFile,
  pickReelFrames,
  reelArithmetic,
  reelFile,
  reelProblems,
  reelSessionProblems,
  type ReelCapture,
  type ReelSession,
} from '../.vitepress/tools/extension-reel.ts'

const overlay = (stability: string, bpm: string) => ({ stability, bpm })
const frame = (name: string, atMs: number, stability: string, bpm: string, reading: number | null) => ({
  name, atMs, before: overlay(stability, bpm), after: overlay(stability, bpm), reading: { bpm: reading },
  player: { t: atMs / 1000, paused: false, ad: false },
})
const SESSION: ReelSession = {
  frames: [
    frame('a.png', 1000, 'listening', '', null),
    frame('b.png', 5000, 'settling', '118', 118.2),
    frame('c.png', 9000, 'stable', '120', 120),
    frame('d.png', 12000, 'stable', '120', 120),
  ],
}
const FRAMES = pickReelFrames(SESSION)?.map((pick) => pick.frame) ?? []
const CAPTURE: ReelCapture = {
  video: {
    url: 'https://www.youtube.com/watch?v=abc',
    title: 'A title',
    channel: 'A channel',
    licence: 'Creative Commons Attribution license (reuse allowed)',
  },
  bpm: '120',
  frames: { light: FRAMES, dark: FRAMES },
}

test('at the end of the zoom, on a 2x screen, no pixel is upscaled', () => {
  const numbers = reelArithmetic()
  assert.ok(numbers.sourcePixelsPerDevicePixel >= 1, 'the capture is upscaled')
  assert.ok(numbers.filePixelsPerDevicePixel >= 1, 'the served file is upscaled')
})

test('reelArithmetic catches a zoom past the limit', () => {
  const numbers = reelArithmetic({ width: 960, deviceScale: 2 }, 2.2, 760)
  assert.ok(numbers.sourcePixelsPerDevicePixel < 1)
})

test('pickReelFrames takes the first listening and settling frames and the last stable one', () => {
  assert.deepEqual(pickReelFrames(SESSION)?.map((pick) => pick.file), ['a.png', 'b.png', 'd.png'])
})

test('pickReelFrames refuses what isn\'t the extension\'s own reading', () => {
  const without = (bad: ReelSession['frames'][number]) => ({
    frames: [...SESSION.frames.filter((f) => f.before.stability !== bad.before.stability), bad],
  })
  const cases = {
    'a stand-in frame': { frames: SESSION.frames.map((f) => ({ ...f, name: `proof-${f.name}` })) },
    'no reading behind the number': without(frame('x.png', 9000, 'stable', '120', null)),
    'a reading that disagrees': without(frame('x.png', 9000, 'stable', '120', 128)),
    'a state that changed during the shot': without({ ...frame('x.png', 9000, 'stable', '120', 120), after: overlay('settling', '121') }),
    'no time recorded': without({ name: 'x.png', before: overlay('stable', '120'), after: overlay('stable', '120'), reading: { bpm: 120 }, player: { t: 9, paused: false, ad: false } }),
    'no player state': without({ ...frame('x.png', 9000, 'stable', '120', 120), player: undefined }),
    'a paused video': without({ ...frame('x.png', 9000, 'stable', '120', 120), player: { t: 9, paused: true, ad: false } }),
    'an ad': without({ ...frame('x.png', 9000, 'stable', '120', 120), player: { t: 9, paused: false, ad: true } }),
    'a video that stopped moving': without({ ...frame('x.png', 9000, 'stable', '120', 120), player: { t: 5, paused: false, ad: false } }),
    'a number while listening': without(frame('x.png', 1000, 'listening', '120', 120)),
  }
  for (const [name, session] of Object.entries(cases)) assert.equal(pickReelFrames(session), null, name)
})

test('pickReelFrames skips the frames after the video stalled, though the overlay keeps its number', () => {
  const stalled = { ...frame('e.png', 15000, 'stable', '120', 120), player: { t: 12, paused: false, ad: false } }
  const picks = pickReelFrames({ frames: [...SESSION.frames, stalled] })
  assert.equal(picks?.at(-1)?.file, 'd.png')
})

test('reelSessionProblems ties a session to the captioned video and the arithmetic', () => {
  const good = {
    ...SESSION,
    id: 'abc',
    licence: 'Creative Commons Attribution license (reuse allowed)',
    viewport: { width: 960, height: 660 },
    scale: 5,
  }
  assert.deepEqual(reelSessionProblems(good, 'abc'), [])
  const cases = {
    'another video': { ...good, id: 'other' },
    'no id': { ...good, id: undefined },
    'no licence': { ...good, licence: null },
    'a non-commercial licence': { ...good, licence: 'Creative Commons Attribution-NonCommercial' },
    'a narrower page': { ...good, viewport: { width: 800, height: 660 } },
    'a shorter page': { ...good, viewport: { width: 960, height: 500 } },
    'a lower scale': { ...good, scale: 2 },
  }
  for (const [name, session] of Object.entries(cases)) assert.notDeepEqual(reelSessionProblems(session, 'abc'), [], name)
})

test('isReelFile accepts what reelFile writes and nothing that could walk out of the folder', () => {
  assert.ok(isReelFile(reelFile('dark', 'wide', 1520)))
  assert.ok(isReelFile(reelFile('light', 'stable', 800)))
  for (const name of ['', '..', '..\\..\\config.ts', '../config.ts', 'dark-stable-1520.webp/../x', 'dark-other-1.webp', 'x.png']) {
    assert.equal(isReelFile(name), false, name)
  }
})

test('reelProblems passes a real capture and refuses the wrong video or licence', () => {
  assert.deepEqual(reelProblems(CAPTURE), [])
  const bad = (video: Partial<ReelCapture['video']>) => reelProblems({ ...CAPTURE, video: { ...CAPTURE.video, ...video } })
  assert.notDeepEqual(bad({ url: 'https://example.com/fake-youtube' }), [])
  assert.notDeepEqual(bad({ licence: 'Standard YouTube License' }), [])
  assert.notDeepEqual(bad({ licence: 'Creative Commons Attribution-NonCommercial' }), [])
  assert.notDeepEqual(bad({ licence: '' }), [])
  assert.notDeepEqual(bad({ licence: 'CC0' }), [], 'the caption says CC BY')
})

test('reelProblems refuses frames out of order or missing', () => {
  const reversed = [...FRAMES].reverse()
  assert.notDeepEqual(reelProblems({ ...CAPTURE, frames: { light: reversed, dark: FRAMES } }), [])
  assert.notDeepEqual(reelProblems({ ...CAPTURE, frames: { light: FRAMES.slice(0, 2), dark: FRAMES } }), [])
})

test('reelProblems refuses themes that show different numbers, since the label names one', () => {
  const other = FRAMES.map((f) => (f.step === 'stable' ? { ...f, bpm: '119' } : f))
  assert.notDeepEqual(reelProblems({ ...CAPTURE, frames: { light: other, dark: FRAMES } }), [])
})

test('the committed capture, once there is one, passes', () => {
  if (REEL_CAPTURE) assert.deepEqual(reelProblems(REEL_CAPTURE), [])
})
