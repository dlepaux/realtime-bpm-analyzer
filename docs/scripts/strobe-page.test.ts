// Run with `npm test`. The strobe light page (RBA-237) around its pure rules (strobe.test.ts):
// how the component wires them, its analytics, its links and what the page says. Node reads the
// sources as text: a browser test would add a dependency for checks a regex can make.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EVENTS, PARAMS } from '../.vitepress/tools/analytics-events.ts'
import { EVERY_KICK_UP_TO_BPM, STROBE_SOURCES } from '../.vitepress/tools/strobe.ts'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const PAGE = read('../strobe-light.md')
const COMPONENT = read('../.vitepress/components/StrobeLight.vue')
const SCRIPT = COMPONENT.split('<template>')[0] ?? ''
const TEMPLATE = COMPONENT.slice(COMPONENT.indexOf('<template>'))
const flat = (text: string) => text.replace(/\s+/g, ' ')
const count = (text: string, pattern: RegExp) => [...text.matchAll(new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`))].length

// ── Analytics ───────────────────────────────────────────────────────────────────────────────

test('analytics: one start event, counted by music source, with no address, no song name and no audio', () => {
  const event = EVENTS.bpm_strobe_started
  assert.deepEqual(event.params, { audio_source: 'required' })
  assert.deepEqual(PARAMS.audio_source, { type: 'enum', values: [...STROBE_SOURCES], scope: 'none' })
  assert.deepEqual([...STROBE_SOURCES], ['demo', 'file', 'mic', 'tab'])
  // Only an enum: no free text that could carry a URL, a file name or anything heard.
  for (const key of Object.keys(event.params)) assert.notEqual(PARAMS[key as keyof typeof PARAMS].type, 'text', key)
  assert.match(event.privacy, /never the sound/i)
  // The tap-era values never went live, so they are gone, not deprecated.
  assert.equal('tempo_source' in PARAMS, false)
})

test('analytics: the component sends the start once, from the click that starts it', () => {
  assert.equal(count(SCRIPT, /track\('bpm_strobe_started'/), 1)
  assert.match(SCRIPT, /track\('bpm_strobe_started', \{ audio_source: chosen \}\)/)
})

// ── The library loads on this page only (RBA-123) ───────────────────────────────────────────

test('the library loads on Start, never in the theme or the page chunk', () => {
  // `import type` is erased at build time; any other import puts the library in the page chunk.
  assert.doesNotMatch(SCRIPT, /^import (?!type ).*from 'realtime-bpm-analyzer'/m, 'a static import of the library')
  assert.match(SCRIPT, /async function openSource\([\s\S]*?await import\('realtime-bpm-analyzer'\)/)
  assert.doesNotMatch(read('../.vitepress/theme/index.ts'), /StrobeLight|realtime-bpm-analyzer'/)
  assert.match(PAGE, /import StrobeLight from '\.\/\.vitepress\/components\/StrobeLight\.vue'/)
})

// ── Safety wiring ───────────────────────────────────────────────────────────────────────────

test('only the Start button\'s click starts it: one call to start(), from one handler, bound once', () => {
  assert.equal(count(SCRIPT, /\bstrobeStart\(/), 1, 'start() is called in one place')
  // The flash history goes with it, so stopping and starting fast can't add a flash.
  assert.match(SCRIPT, /async function startFromClick\(event: MouseEvent\)[\s\S]*?strobe = strobeStart\(strobe\)/)
  assert.match(SCRIPT, /strobe = strobeStop\(strobe\)/)
  assert.equal(count(COMPONENT, /\bstartFromClick\b/), 2, 'the handler is defined once and bound once')
  assert.match(TEMPLATE, /ref="startButton"[\s\S]{0,300}@click="startFromClick"|@click="startFromClick"[\s\S]{0,300}ref="startButton"/)
  // A click right after a stop is a ghost of the stopping tap, or a held key: not a start.
  assert.match(SCRIPT, /async function startFromClick\(event: MouseEvent\) \{\n  if \(running\.value \|\| isTooSoonAfterStop\(stoppedAt, event\.timeStamp\)\) return/)
  assert.match(SCRIPT, /function halt\(\) \{[\s\S]*?stoppedAt = performance\.now\(\)/)
  // Nothing on mount, on a visible tab, on a drop or on a key starts it.
  assert.doesNotMatch(SCRIPT, /onMounted\([^)]*startFromClick|visibilitychange[^\n]*start/)
  assert.doesNotMatch(SCRIPT.slice(SCRIPT.indexOf('function onDrop')), /^\s+(void )?startFromClick/m)
})

test('nothing plays and no device opens before Start: each is reached from startFromClick only', () => {
  // The music plays in connect(), from openSource(), which only startFromClick() calls.
  assert.equal(count(SCRIPT, /player\.start\(\)/), 1)
  assert.match(SCRIPT, /function connect\([\s\S]*?player\.start\(\)/)
  assert.equal(count(SCRIPT, /\bconnect\(gen, held/), 1)
  assert.equal(count(SCRIPT, /await openSource\(/), 1)
  assert.match(SCRIPT, /async function startFromClick[\s\S]*?await openSource\(gen, held, chosen, asking, file\)/)
  // The mic and the share are asked for inside the click, and nowhere else.
  assert.equal(count(SCRIPT, /(?<!function )\bshareTab\(\)/), 1)
  assert.equal(count(SCRIPT, /(?<!function )\bopenMic\(\)/), 1)
  assert.match(SCRIPT, /const asking = chosen === 'tab' \? shareTab\(\) : chosen === 'mic' \? openMic\(\) : null/)
  // The AudioContext is made in the click; the demo is rendered offline, not played, until then.
  assert.match(SCRIPT, /const held: Session = \{ context: new AudioContext\(\)/)
  assert.equal(count(SCRIPT, /new AudioContext\(/), 1)
})

test('every stop path releases its source: the demo, a song, the mic and the shared tab', () => {
  // Every stop ends in halt(), which releases the session, whatever had opened so far.
  assert.match(SCRIPT, /function halt\(\) \{[\s\S]*?if \(session\) release\(session\)\n  session = null/)
  const release = SCRIPT.slice(SCRIPT.indexOf('function release('), SCRIPT.indexOf('function halt('))
  assert.match(release, /held\.player\?\.stop\(\)/, 'the demo and a song stop playing')
  assert.match(release, /held\.stream\?\.getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)/, 'the mic and the tab are released')
  assert.match(release, /held\.analyzer\?\.stop\(\)/)
  assert.match(release, /held\.context\.close\(\)/, 'the context, and the output device with it')
  // A device or a buffer that arrives after a stop is released, not kept.
  assert.ok(count(SCRIPT, /if \(gen !== generation\) return release\(held\)/) >= 4, 'checked after each await')
  // A source that ends by itself stops the light: the track's end, the mic unplugged, the share stopped.
  assert.match(SCRIPT, /player\.addEventListener\('ended', \(\) => setTimeout\(\(\) => void stopIf\(gen, 'The track ended\.'\), SPEAKER_DELAY_MS\)\)/)
  // The live track's end is heard from the moment it opens, before the analyzer is ready.
  assert.match(SCRIPT, /held\.stream = asking \? await asking : null\n    if \(gen !== generation\) return release\(held\)\n[^\n]*\n    held\.stream\?\.getAudioTracks\(\)\[0\]\?\.addEventListener\('ended', \(\) => void stopIf\(gen, 'The sound stopped\.'\)\)/)
})

test('another tab: its video is stopped at once, this tab stays in front, and a share with no sound says so', () => {
  const share = SCRIPT.slice(SCRIPT.indexOf('async function shareTab'), SCRIPT.indexOf('function startError'))
  assert.match(share, /for \(const video of stream\.getVideoTracks\(\)\) \{\n    video\.stop\(\)/)
  assert.match(share, /setFocusBehavior\('no-focus-change'\)/)
  assert.match(share, /selfBrowserSurface: 'exclude'/)
  assert.match(share, /throw new NoTabSound\(\)/)
  // The hidden-tab rule is not weakened for it.
  assert.match(SCRIPT, /function onVisibility\(\) \{\n  if \(document\.visibilityState === 'hidden'\) void stopAndRefocus\(\)\n\}/)
  // Only Chromium on a computer shares a tab's sound; elsewhere the page says so.
  assert.match(SCRIPT, /agent\?\.mobile === false/)
  assert.match(flat(TEMPLATE), /Sharing another tab’s sound works in Chrome and Edge on a computer\./)
  assert.match(flat(TEMPLATE), /Start the music in the other tab first\./)
})

test('the demo and a song wait for the moment the kick is heard; the mic and a tab flash on arrival', () => {
  assert.match(SCRIPT, /const clock = \{ now: performance\.now\(\), currentTime: context\.currentTime, baseLatency: context\.baseLatency, outputLatency: context\.outputLatency \}/)
  assert.match(SCRIPT, /strobe = addKick\(strobe, flashTimeFor\(chosen, contextTime, clock\), strength\)/)
  // The spectrogram marks each kick at its own time on the spectrogram's clock.
  assert.match(SCRIPT, /marks = \[\.\.\.marks, markTimeFor\(chosen, contextTime, clock\)\]/)
  // The mic and the tab are never played back. The demo and a song reach the speakers through a
  // hold of SPEAKER_DELAY_MS, the spectrogram shows them as heard, and the analyzer hears them first.
  assert.doesNotMatch(SCRIPT, /input\.connect\(context\.destination\)/)
  assert.doesNotMatch(SCRIPT, /player\.connect\(context\.destination\)/)
  assert.match(SCRIPT, /const speakers = context\.createDelay\(1\)\s+speakers\.delayTime\.value = SPEAKER_DELAY_MS \/ 1000/)
  assert.match(SCRIPT, /player\.connect\(speakers\)/)
  assert.match(SCRIPT, /speakers\.connect\(context\.destination\)/)
  assert.match(SCRIPT, /speakers\.connect\(analyser\)/)
  assert.match(SCRIPT, /player\.connect\(analyzer\.input\)/)
  assert.doesNotMatch(SCRIPT, /player\.connect\(analyser\)/)
})

test('a song dropped anywhere on the setup is chosen, and the drop target has a keyboard way in', () => {
  assert.match(TEMPLATE, /class="strobe-setup"[\s\S]{0,200}@drop\.prevent="onDrop"/)
  assert.match(SCRIPT, /function chooseSong\(file: File \| undefined\) \{\n  if \(!file\) return\n  song\.value = file\n  source\.value = 'file'/)
  assert.match(TEMPLATE, /class="strobe-drop"[\s\S]{0,600}<button[\s\S]{0,80}@click\.stop="openFilePicker"/)
  assert.match(flat(TEMPLATE), /Drop a song or choose a file/)
})

test('every stop path stops it: Stop, Esc, Space, a tap on the stage, a hidden tab, leaving full screen', () => {
  assert.match(TEMPLATE, /@click="stopAndRefocus"/, 'the Stop control')
  assert.match(SCRIPT, /event\.key === 'Escape' \|\| event\.key === ' '/, 'Esc and Space')
  assert.match(TEMPLATE, /class="strobe-stage"[\s\S]{0,400}@pointerdown\.prevent="stopFromTap"/, 'a tap on the flashing area')
  assert.match(SCRIPT, /function stopFromTap\(\) \{\n  swallowGhostClick\(\)\n  void stopAndRefocus\(\)/)
  assert.match(SCRIPT, /addEventListener\('visibilitychange'/)
  assert.match(SCRIPT, /document\.visibilityState === 'hidden'\) void stopAndRefocus\(\)/)
  assert.match(SCRIPT, /addEventListener\('pagehide', stopAndRefocus\)/)
  assert.match(SCRIPT, /addEventListener\('fullscreenchange'/)
  assert.match(SCRIPT, /onBeforeUnmount\([\s\S]*?halt\(\)/)
})

// ── While it runs, the light fills the window ───────────────────────────────────────────────

const STYLE = COMPONENT.slice(COMPONENT.indexOf('<style'))
/** The declarations of one rule in the component's style, by its exact selector. */
const rule = (selector: string) => {
  const at = STYLE.indexOf(`\n${selector} {`)
  assert.ok(at !== -1, `no rule for ${selector}`)
  return STYLE.slice(at, STYLE.indexOf('}', at))
}

test('while it runs, the stage covers the whole window, with full screen or without it', () => {
  // In the page's flow, focus moving to Stop scrolled most of the light off a phone's screen
  // (RUNNER-RBA-240: 8 px of 591 left at 390 x 844). Fixed to the window, nothing scrolls it away,
  // and iPhone Safari, which has no full screen for a page element, gets the same light.
  const stage = rule('.strobe-stage')
  assert.match(stage, /position: fixed;/)
  assert.match(stage, /inset: 0;/)
  // Above VitePress's own layers (nav, sidebar, backdrop), which stay under 100.
  const z = Number(/z-index: (\d+);/.exec(stage)?.[1])
  assert.ok(z >= 100, `z-index ${z}`)
  assert.doesNotMatch(stage, /min-height|margin:/, 'no size or offset from the card it sits in')
  assert.match(rule('.strobe-light'), /inset: 0;/)
  // The controls are one strip at the bottom: the light is the rest of the window.
  assert.match(rule('.strobe-controls'), /env\(safe-area-inset-bottom\)/)
})

test('a tap that stops the light clicks nothing behind it', () => {
  // The browser's click from the stopping tap lands on what the stage uncovered: on a phone the
  // nav's "On this page" opened under the finger (round 2's browser check). It is swallowed once,
  // in the capture phase, and the listener goes after RESTART_GUARD_MS if no click comes.
  assert.match(SCRIPT, /function swallowGhostClick\(\) \{[\s\S]*?event\.preventDefault\(\)[\s\S]*?event\.stopPropagation\(\)[\s\S]*?window\.addEventListener\('click', swallow, \{ capture: true, once: true \}\)[\s\S]*?setTimeout\(\(\) => window\.removeEventListener\('click', swallow, \{ capture: true \}\), RESTART_GUARD_MS\)/)
})

test('while it runs, no key reaches the page behind the light, such as the site search\'s / or Ctrl+K', () => {
  // The search opened over the light and fought the stage for focus until the browser crashed.
  assert.match(SCRIPT, /window\.addEventListener\('keydown', onKeyDown, \{ capture: true \}\)/)
  assert.match(SCRIPT, /window\.removeEventListener\('keydown', onKeyDown, \{ capture: true \}\)/)
  // The release of the key that stopped it is cancelled too: a browser may click Start on it.
  assert.match(SCRIPT, /event\.preventDefault\(\)\n    stopKey = event\.key\n    void stopAndRefocus\(\)/)
  assert.match(SCRIPT, /function onKeyUp\(event: KeyboardEvent\) \{\n  if \(stopKey === null \|\| event\.key !== stopKey\) return\n  stopKey = null\n  event\.preventDefault\(\)/)
  assert.match(SCRIPT, /window\.addEventListener\('keyup', onKeyUp, \{ capture: true \}\)/)
  assert.match(SCRIPT, /window\.removeEventListener\('keyup', onKeyUp, \{ capture: true \}\)/)
  assert.match(SCRIPT, /function onKeyDown\(event: KeyboardEvent\) \{\n  if \(!running\.value\) return\n  event\.stopPropagation\(\)/)
  assert.match(SCRIPT, /event\.key === 'Escape' \|\| event\.key === ' '/)
})

test('no tap, no typed tempo and no downbeat: the light follows the kicks only', () => {
  assert.doesNotMatch(SCRIPT, /alignToTap|tapToSet|beatsPerBar|setBpm/)
  assert.doesNotMatch(TEMPLATE, /Tap the beat|Beats per bar|Tempo in BPM/)
})

test('moving focus to Stop and back never scrolls the page, and focus stays on the stage while it runs', () => {
  assert.match(SCRIPT, /stopButton\.value\?\.focus\(\{ preventScroll: true \}\)/)
  assert.doesNotMatch(SCRIPT, /stopButton\.value\?\.focus\(\)/)
  // Tab can't reach the page hidden behind the light: focus that leaves the stage returns to Stop.
  assert.match(SCRIPT, /function onFocusIn\(event: FocusEvent\) \{\n  if \(!running\.value \|\| !\(event\.target instanceof Node\) \|\| stage\.value\?\.contains\(event\.target\)\) return/)
  // Shift+Tab from Stop wraps to the last control; anything else comes back to Stop.
  assert.match(SCRIPT, /event\.relatedTarget === stopButton\.value \? controls\[controls\.length - 1\] : stopButton\.value/)
  assert.match(SCRIPT, /document\.addEventListener\('focusin', onFocusIn\)/)
  assert.match(SCRIPT, /document\.removeEventListener\('focusin', onFocusIn\)/)
  assert.match(TEMPLATE, /class="strobe-stage"[\s\S]{0,200}role="dialog"[\s\S]{0,100}aria-modal="true"/)
})

test('the Stop control stays large: the full width of the strip on a phone, with Start\'s padding', () => {
  assert.match(rule('.strobe-controls .strobe-stop'), /flex: 1 1 20rem;/)
  assert.match(rule('.strobe-start,\n.strobe-stop'), /padding: 0\.85rem 1\.75rem;/)
})

test('a stop returns focus to the Start control', () => {
  assert.match(SCRIPT, /function stopAndRefocus\(\)[\s\S]*?halt\(\)[\s\S]*?startButton\.value\?\.focus\(\)/)
})

test('prefers-reduced-motion picks the soft pulse and hides the scrolling spectrogram until asked for', () => {
  assert.match(SCRIPT, /initialStyle\(window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches\)/)
  assert.match(SCRIPT, /showSpectrogram\.value = !reducedMotion\.value/)
  assert.match(SCRIPT, /if \(showSpectrogram\.value\) drawSpectrogram\(now\)/)
  assert.match(TEMPLATE, /v-show="showSpectrogram"/)
})

test('the warning comes before the Start button, and the button points to it and to any error', () => {
  const warning = TEMPLATE.indexOf('id="strobe-warning"')
  const button = TEMPLATE.indexOf('ref="startButton"')
  assert.ok(warning !== -1 && button !== -1 && warning < button, 'the warning is read before the button')
  assert.match(TEMPLATE, /:aria-describedby="error \? 'strobe-error strobe-warning' : 'strobe-warning'"/)
  assert.match(TEMPLATE, /id="strobe-error"/)
  assert.match(flat(TEMPLATE), /photosensitive epilepsy/i)
})

test('every control has a label a screen reader announces', () => {
  const buttons = [...TEMPLATE.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
  assert.ok(buttons.length >= 6, `${buttons.length} buttons found`)
  for (const [, attrs = '', inner = ''] of buttons) {
    // Icons are components with no text: what's left is the button's name.
    const text = inner.replace(/<[^>]*>/g, '').trim()
    assert.ok(/\baria-label=/.test(attrs) || text.length > 0, `a button with no name: ${attrs.trim()}`)
  }
  for (const [tag] of TEMPLATE.matchAll(/<(input|select|textarea)\b[^>]*>/g)) assert.match(tag, /\baria-label=/, tag)
  // A group of controls is named, and a value its buttons change is announced.
  for (const [tag] of TEMPLATE.matchAll(/<[a-z]+\b[^>]*role="group"[^>]*>/g)) assert.match(tag, /aria-label(ledby)?=/, tag)
  // The spectrogram is named, and the tempo beside it is read in the status line instead.
  assert.match(TEMPLATE, /<canvas[\s\S]{0,200}role="img"[\s\S]{0,40}aria-label="Spectrogram/)
})

test('a failed start is announced, and a library fault stops the light and says so', () => {
  assert.match(SCRIPT, /async function stopWithError\(gen: number, message: string\) \{\n  if \(gen !== generation\) return\n  await stopAndRefocus\(\)\n  error\.value = message/)
  assert.match(SCRIPT, /await stopWithError\(gen, startError\(chosen, failure\)\)/)
  assert.match(SCRIPT, /to\.status === 'stopped' && to\.error\) void stopWithError/)
  assert.match(SCRIPT, /if \(chosen === 'file' && !file\) \{\n    error\.value = 'Choose or drop a song first\.'/)
})

test('a held Enter or Space on Start does not start it again: every key down on Start goes through startKeyHeld', () => {
  assert.match(TEMPLATE, /ref="startButton"[\s\S]{0,300}@keydown="onStartKey"/)
  assert.match(SCRIPT, /function onStartKey\(event: KeyboardEvent\) \{\n  if \(startKeyHeld\(event\)\) event\.preventDefault\(\)/)
})

// ── The page ────────────────────────────────────────────────────────────────────────────────

test('the limits say, per source, when the light lands on the kick and when it comes a moment after', () => {
  assert.ok(PAGE.includes('## Limits'))
  const limits = flat(PAGE.slice(PAGE.indexOf('## Limits'), PAGE.indexOf('## Frequently')))
  assert.match(limits, /reacts to the kick, it doesn't predict it/)
  assert.match(limits, /demo track or your song[^.]*lands on it/)
  assert.match(limits, /microphone or another tab[^.]*a moment after it/)
  assert.match(limits, /without a clear kick flashes less/)
  assert.match(limits, /three flashes a second/)
  assert.match(limits, /hides this tab, which stops the light/)
})

test('the page, its FAQ and the warning name the tempo where every second kick starts, from the module', () => {
  const tempo = `${EVERY_KICK_UP_TO_BPM} BPM`
  assert.ok(flat(PAGE.slice(PAGE.indexOf('## Limits'))).includes(`Above ${tempo} it flashes on every second kick`), 'the limits')
  assert.ok(PAGE.includes(`every second kick above ${tempo}?`), 'the FAQ question')
  // The warning reads the constant, so it can't fall out of step with the rule.
  assert.match(flat(TEMPLATE), /above \{\{ EVERY_KICK_UP_TO_BPM \}\} BPM on every second kick/)
  assert.ok(read('../public/llms.txt').includes(`every second kick above ${tempo}`), 'llms.txt')
})

test('the title, the description and the opening lines say what the page does', () => {
  const frontmatter = PAGE.split(/^---$/m)[1] ?? ''
  assert.match(frontmatter, /^title: .*Strobe Light/m)
  assert.match(frontmatter, /^description: .*strobe light.*kick/im)
  const opening = flat(PAGE.split(/^# .+$/m)[1]?.trim().split('\n\n')[0] ?? '')
  assert.match(opening, /flashes your screen on each kick/)
  assert.match(opening, /Nothing flashes, and nothing plays, until you do/)
})

test('every source says the audio stays on the device, and the page links the website privacy page', () => {
  assert.match(flat(COMPONENT), /const STAYS_ON_DEVICE = 'your audio stays on your device'/)
  assert.equal(count(TEMPLATE, /\{\{ STAYS_ON_DEVICE \}\}/), 3, 'the song, the mic and the tab')
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
