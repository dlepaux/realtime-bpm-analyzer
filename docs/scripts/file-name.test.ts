// Run with `npm test`. A file's name on the home tool's result (RBA-116, round 2): one line, cut in
// the middle when it doesn't fit, so a long name can't grow the result past its reserved height.
// The split rule is pure and checked here; the browser measurement on the card is the proof that
// the line holds.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { FILE_NAME_TAIL, fileNameParts } from '../.vitepress/tools/file-name.ts'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const HERO = read('../.vitepress/components/BpmHeroTool.vue')
const LINE = read('../.vitepress/components/FileNameLine.vue')

const SPACED = 'Summer Festival Opening Set Recorded Live At The Main Stage Kick Loop Extended Version Final.wav'
const SOLID = 'SummerFestivalOpeningSetRecordedLiveAtTheMainStageKickLoopExtendedVersionFinalMixEditTwoThre.wav'

test('fileNameParts: head and tail join back to the whole name, whatever its length', () => {
  for (const name of ['a', 'Kick.wav', 'Summer Mix 2026 - Kick Loop (Final).wav', SPACED, SOLID, '']) {
    const { head, tail } = fileNameParts(name)
    assert.equal(head + tail, name, name)
  }
})

test('fileNameParts: the tail keeps the name\'s end, extension included, so a cut name still says which file', () => {
  assert.deepEqual(fileNameParts(SPACED), { head: SPACED.slice(0, -FILE_NAME_TAIL), tail: 'ersion Final.wav' })
  assert.deepEqual(fileNameParts(SOLID), { head: SOLID.slice(0, -FILE_NAME_TAIL), tail: 'xEditTwoThre.wav' })
})

test('fileNameParts: a name no longer than the tail is all tail, with nothing to cut', () => {
  assert.deepEqual(fileNameParts('a'), { head: '', tail: 'a' })
  assert.deepEqual(fileNameParts('Kick.wav'), { head: '', tail: 'Kick.wav' })
  const exact = 'x'.repeat(FILE_NAME_TAIL)
  assert.deepEqual(fileNameParts(exact), { head: '', tail: exact })
})

test('fileNameParts: never splits a character drawn from several code points', () => {
  // A flag is two code points, and an accent can be a combining mark: either cut in two would
  // show a broken glyph on each side of the ellipsis. The tail counts characters as drawn.
  const flag = '\u{1F1EB}\u{1F1F7}'
  const rest = 'z'.repeat(FILE_NAME_TAIL - 1)
  assert.deepEqual(fileNameParts(`Set ${flag}${rest}`), { head: 'Set ', tail: `${flag}${rest}` })
  assert.deepEqual(fileNameParts(`Cafe\u0301${rest}`), { head: 'Caf', tail: `e\u0301${rest}` })
})

test('fileNameParts: without Intl.Segmenter it counts code points, and still never cuts one', () => {
  // Firefox before 125 has no Intl.Segmenter, and every page loads this module.
  const name = `Set \u{1F3B5}${'z'.repeat(FILE_NAME_TAIL - 1)}`
  assert.deepEqual(fileNameParts(name, null), { head: 'Set ', tail: `\u{1F3B5}${'z'.repeat(FILE_NAME_TAIL - 1)}` })
  assert.deepEqual(fileNameParts(SPACED, null), fileNameParts(SPACED))
  const source = read('../.vitepress/tools/file-name.ts')
  assert.match(source, /typeof Intl\.Segmenter === 'function' \?/)
})

test('every state after a file shows the name through FileNameLine, never as wrapping text', () => {
  const after = HERO.slice(HERO.indexOf('<template v-else-if="fileStatus === \'analysing\'">'), HERO.indexOf('<!-- MIC MODE -->'))
  const uses = after.match(/<FileNameLine\s+class="bpm-state-name"\s+:name="fileName \?\? ''"/g) ?? []
  assert.equal(uses.length, 3, 'analysing, result and error')
  assert.doesNotMatch(after, /\{\{\s*fileName\s*\}\}/, 'no bare name that can wrap onto more lines')
  assert.doesNotMatch(HERO, /word-break: break-all/)
})

test('FileNameLine: one line that clips, the full name for screen readers, and a way to read it all by sight', () => {
  assert.match(LINE, /\.file-name-head \{[^}]*white-space: pre;[^}]*overflow: hidden;[^}]*text-overflow: ellipsis;/)
  assert.match(LINE, /\.file-name-tail \{[^}]*white-space: pre;[^}]*flex-shrink: 0;/)
  // Screen readers hear the whole name once; the cut visual is hidden from them.
  assert.match(LINE, /<span class="file-name-full">\{\{ name \}\}<\/span>/)
  assert.match(LINE, /class="file-name-visual"[^>]*aria-hidden="true"/)
  // A cut name becomes a button that shows the whole name, with its state announced.
  assert.match(LINE, /:is="control \? 'button' : 'p'"/)
  assert.match(LINE, /:aria-expanded="control \? open : undefined"/)
  assert.doesNotMatch(LINE, /:title=/, 'a tooltip would repeat the name to a screen reader')
  // One box whether cut or not, with its own line-height, so `.vp-doc p` can't change it.
  assert.match(LINE, /\.file-name-line \{[^}]*min-height: 1\.5rem;[^}]*line-height: 1\.5rem;/)
  // Open, it wraps anywhere, since a name without a space can't wrap otherwise.
  assert.match(LINE, /\.is-open \.file-name-tail \{[^}]*overflow-wrap: anywhere;/)
})

test('a file result sits 0.5rem apart, so its tallest form fits the reserve on a phone', () => {
  // Measured at 320 and 390 px: an alternate reading with 0.6rem gaps went 4 px past 24rem.
  assert.match(HERO, /--bpm-body-min-height: 24rem;/)
  assert.match(HERO, /\.bpm-mode-file \.bpm-state-result \{ gap: 0\.5rem; \}/)
})

test('the name never sets its container\'s width, so a cut name can\'t push the page sideways', () => {
  // On one line a 96-character name is 725 px wide, and the flex and grid items around it took that
  // as their minimum: the page went 463 px past a 320 px screen until the name was contained.
  assert.match(LINE, /\.file-name \{[^}]*width: 100%;[^}]*contain: inline-size;/)
})
