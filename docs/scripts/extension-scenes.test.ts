// The demo is drawn, so nothing external keeps it honest: this does. It holds the sequence to its
// rules (tempos, beats, compositor-only, timing) and pins the drawn widget to the real overlay's
// source, through a snapshot of view.ts. Beside a checkout of rba-pro it also compares that snapshot
// with the live file, so a change there fails here rather than letting the picture drift. CI has no
// such checkout: there the snapshot is what's compared, and refreshing it stays a manual step.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import { ADDRESSES, READINGS, SCENES, TEMPO_RANGE, crowdPath } from '../.vitepress/tools/extension-scenes.ts'
import {
  DOT_PULSE,
  SCENE_LOOPS,
  loopTiming,
  sequenceTracks,
  totalSeconds,
  visits,
} from '../.vitepress/tools/extension-scenes-timeline.ts'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const WIDTHS = { stable: 7, settling: 7.4, listening: 5 }
const SNAPSHOT = read('./fixtures/overlay-view-snapshot.txt')
const CSS = read('../.vitepress/theme/extension-scenes.css')
const REST_CSS = read('../.vitepress/theme/extension-scenes-rest.css')
const SCENES_VUE = read('../.vitepress/components/ExtensionScenes.vue')
const REST_VUE = read('../.vitepress/components/ExtensionScenesRest.vue')
const OVERLAY_VUE = read('../.vitepress/components/ExtensionSceneOverlay.vue')
// Beside this repo, or beside the worktree folder it sits in.
const SIBLING_ROOTS = ['../../../rba-pro/', '../../../../../rba-pro/']
const LIVE_VIEW = SIBLING_ROOTS
  .map((root) => new URL(`${root}extension/src/overlay/view.ts`, import.meta.url))
  .find(existsSync)

test('every tempo shown sits inside the range the overlay reads', () => {
  for (const reading of READINGS) {
    assert.ok(reading >= TEMPO_RANGE.min && reading <= TEMPO_RANGE.max, `${reading} is outside the range`)
  }
  assert.match(SCENES_VUE, /TEMPO_RANGE\.min/, 'the caption states the limit')
  assert.match(SCENES_VUE, /TEMPO_RANGE\.max/)
})

// The extension is a private sibling repo, so only a checkout that has it can compare. CI can't.
const READING_SOURCE = SIBLING_ROOTS
  .map((root) => new URL(`${root}extension/src/lib/reading.ts`, import.meta.url))
  .find(existsSync)
test('the range matches the extension, whose number it repeats', { skip: !READING_SOURCE }, () => {
  const real = /TEMPO_RANGE\s*=\s*\{\s*min:\s*(\d+),\s*max:\s*(\d+)/.exec(readFileSync(READING_SOURCE!, 'utf8'))
  assert.deepEqual([Number(real?.[1]), Number(real?.[2])], [TEMPO_RANGE.min, TEMPO_RANGE.max])
})

test('each picture beats at the number its visit ends on', () => {
  for (const visit of visits()) {
    for (const loop of SCENE_LOOPS[visit.scene.id]) {
      const timing = loopTiming(loop, visit.scene.bpm, visit)
      assert.ok(Math.abs(timing.duration - (loop.beats * 60) / visit.scene.bpm) < 1e-9, loop.target)
    }
  }
  assert.ok(SCENES.every((scene) => SCENE_LOOPS[scene.id].some((loop) => loop.beats === 1)), 'every scene has a beat')
})

test('every loop ends on its rest pose and the opening starts from it, so nothing jumps', () => {
  for (const visit of visits()) {
    for (const loop of SCENE_LOOPS[visit.scene.id]) {
      const { iterations, iterationStart } = loopTiming(loop, visit.scene.bpm, visit)
      if (visit.enter === 0) assert.equal(iterationStart, 0)
      else assert.ok(Math.abs((iterations + iterationStart) - Math.round(iterations + iterationStart)) < 1e-9, loop.target)
    }
  }
})

test('a loop starts and ends on one pose, and a ring on the one its stylesheet rests on', () => {
  for (const loop of Object.values(SCENE_LOOPS).flat()) {
    const first = loop.frames[0]
    const last = loop.frames.at(-1)
    assert.equal(first?.opacity, last?.opacity, loop.target)
    if (!first?.transform?.startsWith('rotate(') && !loop.target.includes('sweep')) assert.equal(first?.transform, last?.transform, loop.target)
  }
  for (const [ring, scale, opacity] of [['.vid-ring-1', '0.92', 0.5], ['.vid-ring-2', '1.28', 0.3]] as const) {
    const start = SCENE_LOOPS.video.find((loop) => loop.target === ring)?.frames[0]
    assert.equal(start?.transform, `scale(${scale})`)
    assert.equal(start?.opacity, opacity)
    assert.match(CSS, new RegExp(`\\${ring} \\{ transform: scale\\(${scale}\\);`))
  }
  assert.match(CSS, /\.vid-ring-2 \{[^}]*opacity: 0\.3;/)
})

test('only the compositor moves it: transform and opacity, in every keyframe', () => {
  const allowed = new Set(['offset', 'easing', 'transform', 'opacity'])
  const frames = [
    ...sequenceTracks(WIDTHS).flatMap((track) => track.frames),
    ...Object.values(SCENE_LOOPS).flat().flatMap((loop) => loop.frames),
    ...DOT_PULSE.frames,
  ]
  assert.ok(frames.length > 100)
  for (const frame of frames) {
    for (const key of Object.keys(frame)) assert.ok(allowed.has(key), `animates ${key}`)
    assert.ok(frame.offset >= 0 && frame.offset <= 1, 'offset in range')
  }
})

test('keyframes run forward, which WAAPI would otherwise refuse at play time', () => {
  for (const track of sequenceTracks(WIDTHS)) {
    for (let index = 1; index < track.frames.length; index += 1) {
      assert.ok((track.frames[index]?.offset ?? 0) >= (track.frames[index - 1]?.offset ?? 0), `${track.target} at ${index}`)
    }
  }
})

test('the sequence stays under twelve seconds and ends where it began', () => {
  assert.ok(totalSeconds() < 12, `${totalSeconds()} s`)
  const all = visits()
  assert.deepEqual(all.map((visit) => visit.scene.id), ['video', 'music', 'waveform', 'video'])
  for (const track of sequenceTracks(WIDTHS)) {
    assert.equal(track.frames.at(-1)?.offset, 1, track.target)
  }
})

test('what every visitor downloads holds no motion', () => {
  const firstFrame = read('../.vitepress/tools/extension-scenes.ts')
  assert.doesNotMatch(firstFrame, /keyframe|easing|sequenceTracks/i)
  for (const source of [SCENES_VUE, OVERLAY_VUE]) {
    assert.doesNotMatch(source, /^import (?!type )[^\n]*(?:timeline|player)'/m, 'statically imports the motion')
  }
})

test('the server sends a first frame that already has a number, stable, on the video page', () => {
  assert.equal(visits()[0]?.stable, 0)
  assert.match(SCENES_VUE, /data-scene="video"/)
  assert.match(OVERLAY_VUE, /data-reading/)
  const stable = sequenceTracks(WIDTHS).find((track) => track.target === `.hint[data-stability='stable']`)
  assert.equal(stable?.frames[0]?.opacity, 1)
})

test('it is all drawn: no footage, sound, or pictures of any platform', () => {
  for (const source of [SCENES_VUE, REST_VUE, OVERLAY_VUE]) {
    assert.doesNotMatch(source, /<(video|audio|source)\b/)
    assert.doesNotMatch(source, /\.(webp|png|jpe?g|mp4|webm|mp3)\b/)
  }
  assert.deepEqual(readdirSync(new URL('../.vitepress/assets/extension/', import.meta.url)).filter((file) => /\.webp$/.test(file)), [])
})

test('a still is not called sped up: the words show only under the query that gets motion', () => {
  assert.match(CSS, /\.ext-scenes-caption \.ext-scenes-sped \{ display: none; \}/)
  const query = /ANIMATE_WHERE = '([^']+)'/.exec(SCENES_VUE)?.[1]
  assert.ok(query)
  assert.ok(CSS.includes(`@media ${query} {\n  .ext-scenes-caption .ext-scenes-sped { display: inline; }`))
})

test('the crowd is one solid mass: every arc winds the same way, so overlaps leave no holes', () => {
  const arcs = [...crowdPath(7919, 440).matchAll(/a\S+ \S+ 0 1 (\d)/g)].map((match) => match[1])
  assert.ok(arcs.length > 0)
  assert.deepEqual([...new Set(arcs)], ['1'])
})

test('no platform is named or drawn on the demo', () => {
  const NAMES = /youtube|soundcloud|bandcamp|spotify|mixcloud|twitch/i
  for (const source of [SCENES_VUE, REST_VUE, OVERLAY_VUE, CSS, REST_CSS]) assert.doesNotMatch(source, NAMES)
  assert.match(SCENES_VUE, /not affiliated with any site named here/)
  for (const address of Object.values(ADDRESSES)) assert.match(address, /^[a-z]+\.example\//, 'only reserved example domains')
})

test('it claims nothing about accuracy, and says what it is', () => {
  const copy = [SCENES_VUE, REST_VUE].map((source) => source.slice(source.indexOf('<template>'))).join('\n')
  assert.doesNotMatch(copy, /accura|\bbest\b|\bprivate\b|—|–/i)
  assert.match(copy, /Illustration/)
})

// The drawn widget's CSS, with its scene units read back as the real pixels.
function drawnOverlay(): Map<string, Map<string, string>> {
  const start = CSS.indexOf('/* overlay:start */')
  const end = CSS.indexOf('/* overlay:end */')
  assert.ok(start !== -1 && end > start, 'the pinned block is marked')
  const block = CSS.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '').replace(/calc\(([-\d.]+) \* var\(--u\)\)/g, '$1px')
  return parseRules(block.replaceAll('.ext-sw ', ''))
}

function parseRules(css: string): Map<string, Map<string, string>> {
  const rules = new Map<string, Map<string, string>>()
  for (const [, selector = '', body = ''] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = new Map(body.split(';').map((part) => part.split(':')).filter((part) => part.length >= 2)
      .map(([key = '', ...value]) => [key.trim(), value.join(':').trim()]))
    const name = selector.trim().replace(/\s+/g, ' ')
    rules.set(name, new Map([...(rules.get(name) ?? []), ...declarations]))
  }
  return rules
}

test('every declaration of the drawn widget is the real overlay\'s', () => {
  const style = SNAPSHOT.slice(SNAPSHOT.indexOf('const STYLE'), SNAPSHOT.indexOf('const TEMPLATE')).replace(/\/\*[\s\S]*?\*\//g, '')
  const real = parseRules(style)
  const drawn = drawnOverlay()
  assert.ok(drawn.size >= 12, 'the pinned block is all there')
  for (const [selector, declarations] of drawn) {
    // The close button is the real overlay's only visible `button`.
    const theirs = real.get(selector === '.close' ? 'button' : selector)
    assert.ok(theirs, `view.ts has no ${selector}`)
    for (const [property, value] of declarations) assert.equal(value, theirs.get(property), `${selector} ${property}`)
  }
})

test('the state names are the real overlay\'s', () => {
  for (const state of ['listening', 'settling', 'stable']) {
    assert.ok(SNAPSHOT.includes(`${state}: '${state}'`), `view.ts has no state ${state}`)
  }
  for (const attribute of ['data-state="tempo"', 'data-stability="settling"', 'data-stability="stable"', 'data-level="high"', 'data-level="medium"', 'data-level="low"']) {
    assert.ok(OVERLAY_VUE.includes(attribute), `the drawn widget has no ${attribute}`)
  }
})

test('the dots pulse as the real ones do', () => {
  assert.match(SNAPSHOT, /rba-pulse 1\.2s/)
  assert.match(SNAPSHOT, /animation-delay: \.2s/)
  assert.equal(DOT_PULSE.seconds, 1.2)
  assert.equal(DOT_PULSE.stagger, 0.2)
  assert.match(SNAPSHOT, /translateY\(-3px\)/)
  assert.equal(DOT_PULSE.frames[1]?.transform, `translateY(${-3 / 16}em)`)
})

test('the snapshot is still what the extension ships, where its source is here to compare', { skip: LIVE_VIEW === undefined }, () => {
  const live = readFileSync(LIVE_VIEW as URL, 'utf8')
  const blocks = SNAPSHOT.split('\n').filter((line) => line.trim().length > 0)
  for (const line of blocks) assert.ok(live.includes(line), `view.ts no longer has: ${line}`)
})
