// Run with `npm test`. The strobe light page (RBA-237) around its pure rules (strobe.test.ts):
// how the component wires them, its analytics, its links and what the page says. Node reads the
// sources as text: a browser test would add a dependency for checks a regex can make.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EVENTS, PARAMS } from '../.vitepress/tools/analytics-events.ts'
import { TEMPO_SOURCES } from '../.vitepress/tools/strobe.ts'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const PAGE = read('../strobe-light.md')
const COMPONENT = read('../.vitepress/components/StrobeLight.vue')
const SCRIPT = COMPONENT.split('<template>')[0] ?? ''
const TEMPLATE = COMPONENT.slice(COMPONENT.indexOf('<template>'))
const flat = (text: string) => text.replace(/\s+/g, ' ')
const count = (text: string, pattern: RegExp) => [...text.matchAll(new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`))].length

// ── Analytics ───────────────────────────────────────────────────────────────────────────────

test('analytics: one start event, counted by tempo source, with no address and no audio', () => {
  const event = EVENTS.bpm_strobe_started
  assert.deepEqual(event.params, { tempo_source: 'required', bpm: 'optional' })
  assert.deepEqual(PARAMS.tempo_source, { type: 'enum', values: [...TEMPO_SOURCES], scope: 'none' })
  assert.deepEqual([...TEMPO_SOURCES], ['typed', 'tapped', 'mic'])
  // Only an enum and a number: no free text that could carry a URL or anything heard.
  for (const key of Object.keys(event.params)) assert.notEqual(PARAMS[key as keyof typeof PARAMS].type, 'text', key)
  assert.match(event.privacy, /never .*sound/i)
})

test('analytics: the tempo source needs no GA4 setup, since the readback reads it from the BigQuery export', () => {
  // A `none` param is not registered under Custom definitions; BigQuery keeps every param.
  assert.equal(PARAMS.tempo_source.scope, 'none')
  assert.equal(PARAMS.bpm.scope, 'metric', 'bpm is already registered as a metric')
})

test('analytics: the component sends the start once, from the click that starts it', () => {
  assert.equal(count(SCRIPT, /track\('bpm_strobe_started'/), 1)
  assert.match(SCRIPT, /track\('bpm_strobe_started', \{ tempo_source: source\.value/)
})

// ── The library loads on this page only (RBA-123) ───────────────────────────────────────────

test('the library loads only when the microphone mode starts, never in the theme or the page chunk', () => {
  // `import type` is erased at build time; any other import puts the library in the page chunk.
  assert.doesNotMatch(SCRIPT, /^import (?!type ).*from 'realtime-bpm-analyzer'/m, 'a static import of the library')
  assert.match(SCRIPT, /await import\('realtime-bpm-analyzer'\)/)
  assert.doesNotMatch(read('../.vitepress/theme/index.ts'), /StrobeLight|realtime-bpm-analyzer'/)
  assert.match(PAGE, /import StrobeLight from '\.\/\.vitepress\/components\/StrobeLight\.vue'/)
})

// ── Safety wiring ───────────────────────────────────────────────────────────────────────────

test('only the Start button\'s click starts it: one call to start(), from one handler, bound once', () => {
  assert.equal(count(SCRIPT, /\bstrobeStart\(\)/), 1, 'start() is called in one place')
  assert.match(SCRIPT, /async function startFromClick\(\)[\s\S]*?strobeStart\(\)/)
  assert.equal(count(COMPONENT, /\bstartFromClick\b/), 2, 'the handler is defined once and bound once')
  assert.match(TEMPLATE, /ref="startButton"[\s\S]{0,200}@click="startFromClick"|@click="startFromClick"[\s\S]{0,200}ref="startButton"/)
  // Nothing on mount, on a visible tab or on a key starts it.
  assert.doesNotMatch(SCRIPT, /onMounted\([^)]*startFromClick|visibilitychange[^\n]*start/)
})

test('every stop path stops it: Stop, Esc, Space, a tap on the stage, a hidden tab, leaving full screen', () => {
  assert.match(TEMPLATE, /@click="stopAndRefocus"/, 'the Stop control')
  assert.match(SCRIPT, /key === 'Escape' \|\| key === ' '/, 'Esc and Space')
  assert.match(TEMPLATE, /class="strobe-stage"[\s\S]{0,400}@pointerdown="stopAndRefocus"/, 'a tap on the flashing area')
  assert.match(SCRIPT, /addEventListener\('visibilitychange'/)
  assert.match(SCRIPT, /document\.visibilityState === 'hidden'\) void stopAndRefocus\(\)/)
  assert.match(SCRIPT, /addEventListener\('pagehide', stopAndRefocus\)/)
  assert.match(SCRIPT, /addEventListener\('fullscreenchange'/)
  assert.match(SCRIPT, /onBeforeUnmount\([\s\S]*?halt\(\)/)
})

test('a stop returns focus to the Start control', () => {
  assert.match(SCRIPT, /function stopAndRefocus\(\)[\s\S]*?halt\(\)[\s\S]*?startButton\.value\?\.focus\(\)/)
})

test('prefers-reduced-motion picks the starting style through initialStyle()', () => {
  assert.match(SCRIPT, /initialStyle\(window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches\)/)
})

test('the warning comes before the Start button, and the button points to it', () => {
  const warning = TEMPLATE.indexOf('id="strobe-warning"')
  const button = TEMPLATE.indexOf('ref="startButton"')
  assert.ok(warning !== -1 && button !== -1 && warning < button, 'the warning is read before the button')
  assert.match(TEMPLATE, /aria-describedby="strobe-warning"/)
  assert.match(flat(TEMPLATE), /photosensitive epilepsy/i)
})

test('every control has a label a screen reader announces', () => {
  for (const tag of TEMPLATE.match(/<(button|input|select)\b[^>]*>/g) ?? []) {
    const labelled = /aria-label=|aria-labelledby=|:aria-label=/.test(tag) || /<button/.test(tag)
    assert.ok(labelled, `unlabelled control: ${tag}`)
  }
  // Inputs sit inside a <label> or carry aria-label.
  for (const tag of TEMPLATE.match(/<input\b[^>]*>/g) ?? []) assert.match(tag, /aria-label=|id="/, tag)
})

// ── The page ────────────────────────────────────────────────────────────────────────────────

test('the title, the description and the opening lines say what the page does', () => {
  const frontmatter = PAGE.split(/^---$/m)[1] ?? ''
  assert.match(frontmatter, /^title: .*Strobe Light/m)
  assert.match(frontmatter, /^description: .*strobe light.*beat/im)
  const opening = flat(PAGE.split(/^# .+$/m)[1]?.trim().split('\n\n')[0] ?? '')
  assert.match(opening, /flashes your screen on the beat/)
})

test('the limits are on the page: a steady grid, no beat positions from the mic, and drift on a tempo change', () => {
  const limits = flat(PAGE.slice(PAGE.indexOf('## Limits')))
  assert.ok(PAGE.includes('## Limits'))
  assert.match(limits, /steady grid/)
  assert.match(limits, /not where the beats fall/)
  assert.match(limits, /drifts/)
  assert.match(limits, /180 BPM/)
  assert.match(limits, /three flashes a second/)
})

test('the microphone mode says the audio stays on the device, and the page links the website privacy page', () => {
  assert.match(flat(COMPONENT), /your audio stays on your device/)
  assert.match(flat(PAGE), /your audio stays on your device/)
  assert.match(PAGE, /\]\(\/website-privacy\)/)
})

test('the page links the metronome and tap tempo, and theirs link back', () => {
  assert.match(PAGE, /\(\/metronome\)|href="\/metronome"/)
  assert.match(PAGE, /\(\/tap-tempo\)|href="\/tap-tempo"/)
  for (const path of ['../metronome.md', '../tap-tempo.md']) {
    const more = read(path).slice(read(path).indexOf('## More free tools'))
    assert.match(more, /href="\/strobe-light"/, path)
  }
})

test('marketing: no accuracy claims, no "best", no comparisons', () => {
  for (const text of [PAGE, TEMPLATE]) {
    assert.doesNotMatch(text, /\bbest\b|\baccura(te|cy)\b|\bprecise\b|\bbetter than\b|\b\d+(\.\d+)? ?%/i)
  }
})
