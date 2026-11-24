// The video page's crowd is a copy of the extension's Settings crowd (rba-pro), so these are
// the same shape rules as its crowd.test.ts, plus how this page draws and moves the rows.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { CROWD_LAYERS, crowdPath } from '../.vitepress/tools/extension-scenes-crowd.ts'
import { SCENE_LOOPS } from '../.vitepress/tools/extension-scenes-timeline.ts'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const CSS = read('../.vitepress/theme/extension-scenes.css')
const SCENES_VUE = read('../.vitepress/components/ExtensionScenes.vue')
const heads = (path: string) => (path.match(/A7\.5 7\.5 0 1 1/g) ?? []).length
const hands = (path: string) => (path.match(/A3\.6 3\.6 0 0 1/g) ?? []).length

test('the crowd is the same every time, and differs by seed', () => {
  assert.equal(crowdPath(11, 440), crowdPath(11, 440))
  assert.notEqual(crowdPath(11, 440), crowdPath(29, 440))
})

test('a row is one outline, so the rim of light traces the skyline and nothing inside the crowd', () => {
  for (const [seed, width] of [[11, 440], [29, 300], [7919, 440], [104729, 300]] as const) {
    const path = crowdPath(seed, width)
    assert.equal(path.match(/M/g)?.length, 1)
    assert.equal(path.match(/Z/g)?.length, 1)
    assert.ok(path.endsWith('Z'))
  }
})

test('a row closes below the 70-high scene and past both sides, so no rim runs along its base or edges', () => {
  const path = crowdPath(11, 440)
  assert.ok(path.startsWith('M-20 200'))
  assert.match(path, /L460\.0 [\d.]+V200Z$/)
  assert.doesNotMatch(path, /\b70V|V70Z/)
})

test('a row is heads and a few raised hands, with no ball at the end of an arm', () => {
  const path = crowdPath(11, 440)
  assert.ok(heads(path) > 14)
  assert.ok(hands(path) > 0)
  assert.ok(hands(path) < heads(path) / 2)
  // A full circle needs two arcs in a row; the stick-figure crowd drew every head and hand that way.
  assert.doesNotMatch(path, /A[^A-Z]+A/)
})

test('every raised hand stays inside the top of the scene', () => {
  for (const [seed, width] of [[11, 440], [29, 300]] as const) {
    const palms = [...crowdPath(seed, width).matchAll(/ ([\d.]+)A3\.6/g)].map((match) => Number(match[1]))
    for (const palm of palms) assert.ok(palm - 3.6 > 0)
  }
})

test('the crowd stands four rows deep, listed from the back of the room to the front', () => {
  assert.deepEqual(CROWD_LAYERS.map((layer) => layer.depth), ['far', 'back', 'middle', 'front'])
})

test('each row further back is smaller and denser: a wider viewBox fits more, smaller people', () => {
  const widths = CROWD_LAYERS.map((layer) => layer.width)
  assert.deepEqual(widths, widths.toSorted((a, b) => b - a))
  assert.equal(new Set(widths).size, widths.length)
  const counts = CROWD_LAYERS.map((layer) => heads(crowdPath(layer.seed, layer.width)))
  assert.deepEqual(counts, counts.toSorted((a, b) => b - a))
  assert.equal(new Set(counts).size, counts.length)
})

test('every row has its own crowd and a few raised hands', () => {
  assert.equal(new Set(CROWD_LAYERS.map((layer) => layer.seed)).size, CROWD_LAYERS.length)
  for (const layer of CROWD_LAYERS) {
    const path = crowdPath(layer.seed, layer.width)
    assert.ok(hands(path) > 0, layer.depth)
    assert.ok(hands(path) < heads(path) / 2, layer.depth)
  }
})

test('the page draws every row from the list, each in the shape of its viewBox', () => {
  assert.match(SCENES_VUE, /v-for="row in crowd"/)
  assert.match(SCENES_VUE, /:viewBox="`0 0 \$\{row\.width\} 70`"/)
  for (const layer of CROWD_LAYERS) {
    assert.ok(CSS.includes(`.vid-crowd-${layer.depth} { aspect-ratio: ${layer.width} / 70;`), layer.depth)
  }
  // The rows reach down to y 200, past their viewBox: the player clips them, not each svg.
  assert.match(CSS, /\.vid-crowd \{[^}]*overflow: visible;/)
})

test('further back, a row sits higher and takes on more of the stage light', () => {
  const rule = (depth: string) => new RegExp(`\\.vid-crowd-${depth} \\{[^}]*bottom: (-?[\\d.]+)%`).exec(CSS)?.[1]
  const bottoms = CROWD_LAYERS.map((layer) => Number(rule(layer.depth)))
  assert.ok(bottoms.every((bottom) => Number.isFinite(bottom)))
  assert.deepEqual(bottoms, bottoms.toSorted((a, b) => b - a))
  assert.equal(new Set(bottoms).size, bottoms.length)
})

test('the rows bob in a ripple: each one further back peaks a little ahead of the one in front', () => {
  const peaks = CROWD_LAYERS.map((layer) => {
    const loop = SCENE_LOOPS.video.find((candidate) => candidate.target === `.vid-crowd-${layer.depth}`)
    assert.ok(loop, `no loop moves the ${layer.depth} row`)
    return { beats: loop.beats, peak: loop.frames[1]?.offset ?? Number.NaN }
  })
  const ripple = peaks.slice(0, -1)
  assert.ok(ripple.every((row) => row.beats === ripple[0]?.beats), 'the back rows share one period')
  const offsets = ripple.map((row) => row.peak)
  assert.deepEqual(offsets, offsets.toSorted((a, b) => a - b))
  assert.equal(new Set(offsets).size, offsets.length)
  assert.ok(offsets.every((offset) => offset > 0 && offset < 1))
  assert.doesNotMatch(SCENES_VUE + CSS, /vid-crowd-[ab]\b/, 'the two-row names are gone')
})
