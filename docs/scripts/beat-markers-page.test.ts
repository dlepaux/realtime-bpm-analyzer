// Run with `npm test`. The beat-marker export made visible (RBA-116): a line on the home's analyzer
// before any result, the export as an action after one, and the /beat-markers landing. The page
// and the components are read as text, as the other page tests do: what is checked is the copy a
// visitor and a search engine read, and the hooks that wire it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EXPORT_TIMECODES, IMPORT_STEPS, MARKER_FORMATS } from '../.vitepress/tools/beat-markers.ts'
import { EVENTS } from '../.vitepress/tools/analytics-events.ts'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const PAGE = read('../beat-markers.md')
const HERO = read('../.vitepress/components/BpmHeroTool.vue')
const EXPORT = read('../.vitepress/components/BeatMarkerExport.vue')
const VIDEO = read('../video-bpm.md')
const FRAMES = read('../bpm-to-frames.md')

/** A `key: value` line of the page's frontmatter, unquoted. */
const field = (key: string) =>
  PAGE.split(/^---$/m)[1]?.match(new RegExp(`^${key}: *(.+)$`, 'm'))?.[1]?.trim().replace(/^(["'])(.*)\1$/, '$2')
/** The page's prose: frontmatter, tags and markdown marks out, one line. */
const prose = (markdown: string) =>
  markdown.split(/^---$/m).slice(2).join('---').replace(/<[^>]+>/g, ' ').replace(/\*\*|`/g, '').replace(/\s+/g, ' ')
const EDITORS = ['Premiere Pro', 'DaVinci Resolve', 'Final Cut Pro']

test('the title, the description and the H1 name the intent: beat markers for video editing', () => {
  assert.equal(field('title'), 'Auto Beat Markers for Video Editing')
  const description = field('description') ?? ''
  assert.match(description, /beat/i)
  for (const editor of EDITORS) assert.ok(description.includes(editor), `description: ${editor}`)
  const h1 = PAGE.match(/^# (.+)$/gm) ?? []
  assert.deepEqual(h1, ['# Beat Markers for Premiere Pro, DaVinci Resolve and Final Cut Pro'])
})

test('the tool is on the page, and its export opens once a result is in', () => {
  assert.match(PAGE, /<BpmHeroTool variant="markers" \/>/)
  assert.match(HERO, /variant\?: 'audio' \| 'video' \| 'markers'/)
  assert.match(HERO, /:start-open="variant === 'markers'"/)
  assert.match(EXPORT, /startOpen\?: boolean/)
  assert.match(EXPORT, /:open="startOpen"/)
})

test('the page lists every format and every frame rate the export offers', () => {
  const text = prose(PAGE)
  for (const format of MARKER_FORMATS) assert.ok(text.includes(format.label), format.label)
  for (const timecode of EXPORT_TIMECODES) assert.ok(text.includes(timecode.label), timecode.label)
})

test('the import steps are the export panel\'s own, word for word', () => {
  // One source: the panel reads IMPORT_STEPS, so the page and the panel can't drift apart.
  assert.match(EXPORT, /IMPORT_STEPS\[format\]/)
  assert.doesNotMatch(EXPORT, /const IMPORT_STEPS/)
  const text = prose(PAGE)
  for (const step of Object.values(IMPORT_STEPS)) assert.ok(text.includes(step), step)
})

// /video-bpm's words for a file nobody has imported yet in each editor (RBA-127): the same
// sentence on both pages until a round trip has been done by hand.
const IMPORT_NOTE = 'The files haven\'t been tested by importing them into each editor yet, so check that the first marker and the last one sit on the beat before you cut.'

test('the limits are stated as RBA-116 words them', () => {
  const text = prose(PAGE)
  assert.ok(prose(VIDEO).includes(IMPORT_NOTE), '/video-bpm changed its wording: update both')
  assert.ok(text.includes(IMPORT_NOTE), 'the import note')
  assert.match(text, /songs with a steady tempo/)
  assert.match(PAGE, /^## Limits$/m)
})

test('the page has an FAQ that answers the target queries, rendered from its frontmatter', () => {
  assert.match(PAGE, /<ToolFaq \/>/)
  const questions = [...PAGE.matchAll(/^ {2}- q: (.+)$/gm)].map((match) => match[1] ?? '')
  assert.ok(questions.length >= 5, `${questions.length} questions`)
  const asked = questions.join(' ')
  for (const editor of EDITORS) assert.ok(asked.includes(editor), `no question about ${editor}`)
  assert.match(asked, /free/i)
  assert.match(asked, /FCPXML/)
})

test('names, not logos: the editors are text, with no image of theirs and no rival product', () => {
  for (const source of [PAGE, HERO]) {
    assert.doesNotMatch(source, /<img\b/, 'no image: the visual is our own drawing')
    assert.doesNotMatch(source, /logo|screenshot/i)
  }
  // Competitor names stay out of the copy (RBA-116): the paid plugins the research found.
  for (const source of [PAGE, HERO, EXPORT]) assert.doesNotMatch(source, /BeatEdit|aescripts|plugin/i)
})

test('the visual is our own timeline illustration, captioned as one, and marked decorative', () => {
  assert.match(PAGE, /<BeatMarkerIllustration \/>/)
  const drawing = read('../.vitepress/components/BeatMarkerIllustration.vue')
  assert.match(drawing, /<figure\b/)
  assert.match(drawing, /<figcaption[^>]*>\s*Illustration\b/)
  // The caption says what it shows, so the drawing itself is hidden from screen readers.
  assert.match(drawing, /<svg[^>]*aria-hidden="true"/)
})

test('the home line: before any result, the editors named, a link to the landing', () => {
  const line = HERO.match(/<p\s+v-if="variant === 'audio'"\s+class="bpm-markers-line"[\s\S]*?<\/p>/)?.[0]
  assert.ok(line, 'no markers line in the idle file panel')
  // Inside the idle drop zone, so it is there before a result and adds no height to the hero.
  const idle = HERO.slice(HERO.indexOf('<template v-if="fileStatus === \'idle\'">'), HERO.indexOf('<template v-else-if="fileStatus === \'analysing\'">'))
  assert.ok(idle.includes(line), 'the line belongs to the idle file panel')
  assert.ok(idle.indexOf(line) < idle.lastIndexOf('</div>'), 'inside the drop zone')
  for (const editor of EDITORS) assert.ok(line.includes(editor), editor)
  assert.match(line, /href="\/beat-markers"/)
  // A click on the link must not open the file picker under it.
  assert.match(line, /@click\.stop="onMarkersLineClick"/)
  assert.match(HERO, /track\('bpm_markers_home_clicked'\)/)
})

test('after a result the export is an action with a name, not a small link', () => {
  const summary = EXPORT.match(/<summary[^>]*>[\s\S]*?<\/summary>/)?.[0] ?? ''
  assert.match(summary, /class="marker-action"/)
  assert.match(summary, /Export beat markers/)
  // Its name is its text: the icon is hidden from screen readers.
  assert.match(summary, /aria-hidden="true"/)
  // A pill a finger can hit, styled as the action it is.
  assert.match(EXPORT, /\.marker-action \{[^}]*min-height: 44px/)
})

test('the export\'s analytics are untouched, so RBA-127\'s readout compares before and after', () => {
  assert.deepEqual(EVENTS.bpm_markers_exported.params, { format: 'required', frame_rate: 'required', export_format: 'required' })
  assert.match(EXPORT, /track\('bpm_markers_exported', \{ format: format\.value, frame_rate: choice\.value\.id, export_format: format\.value \}\)/)
})

test('the home line\'s click is its own event, with no param, so GA4 needs no new definition', () => {
  assert.deepEqual(EVENTS.bpm_markers_home_clicked.params, {})
})

test('/video-bpm and /bpm-to-frames point to the landing', () => {
  assert.match(VIDEO, /\]\(\/beat-markers\)/)
  assert.match(FRAMES, /\]\(\/beat-markers\)/)
})
