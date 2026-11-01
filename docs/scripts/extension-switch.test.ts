// Run with `npm test`. The checks themselves, against small fake builds: a check that
// can't fail proves nothing. Real builds in both states run in CI (verify-extension-switch.ts).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EXTENSION_STORE_URL } from '../.vitepress/tools/extension-config.ts'
import { FIXTURE_STORE_URL, switchProblems, type BuiltSite } from './extension-switch.ts'

const STORE = `https://chromewebstore.google.com/detail/live-bpm-detector/${'a'.repeat(32)}`
const NAV = 'href="/guide/getting-started" href="/api/"'
const NAV_ON = `href="/extension/" ${NAV}`
const SITE_URL = 'https://www.realtime-bpm-analyzer.com'
const OG_IMAGE = `<meta property="og:image" content="${SITE_URL}/live-bpm-detector-share.png">`
const LLMS_LINE = `- [Live BPM Detector](${SITE_URL}/extension/): the extension\n## Library`
const LOC = '<loc>https://www.realtime-bpm-analyzer.com/extension/</loc>'
const IMG = '<img class="ext-shot" src="/assets/player-1280.abc.webp" width="1280" height="800" alt="A picture">'
const BUTTON = `<a class="tt-btn ext-install-btn tt-btn-primary" href="${STORE}">Add to Chrome</a>`

function site(files: Record<string, string>): BuiltSite {
  return { paths: Object.keys(files), read: (path) => files[path] ?? '', size: (path) => (files[path] ?? '').length }
}

const OFF: Record<string, string> = {
  'hashmap.json': '{"extension_privacy.md":"x"}',
  'sitemap.xml': '<loc>https://www.realtime-bpm-analyzer.com/extension/privacy</loc>',
  'llms.txt': '# Realtime BPM Analyzer',
  'extension/goodbye.html': 'Changed your mind?',
  'index.html': `${NAV} Developer Docs`,
  'tap-tempo.html': NAV,
  'metronome.html': NAV,
}

const ON: Record<string, string> = {
  'hashmap.json': '{"extension_index.md":"x"}',
  'sitemap.xml': LOC,
  'llms.txt': LLMS_LINE,
  'live-bpm-detector-share.png': 'x',
  'extension/index.html': `<title>Live BPM Detector</title><meta property="og:title" content="Live BPM Detector: x"><link rel="canonical" href="https://www.realtime-bpm-analyzer.com/extension/">${OG_IMAGE}"@type":"SoftwareApplication","installUrl":"${STORE}","price":"0" <h1>Live BPM Detector</h1> ${BUTTON} ${IMG}`,
  'extension/goodbye.html': `<a href="${STORE}">Reinstall the extension</a>`,
  'assets/player-1280.abc.webp': 'x',
  'index.html': `${NAV_ON} Developer Docs Live BPM Detector for Chrome ext-band Chrome extension for the music in your tabs`,
  'tap-tempo.html': `${NAV_ON} Live BPM Detector</a>`,
  'metronome.html': `${NAV_ON} Live BPM Detector</a>`,
  'bpm-to-ms.html': NAV_ON,
  'guide/getting-started.html': NAV_ON,
}

test('switchProblems: a clean build passes in each state', () => {
  assert.deepEqual(switchProblems(site(OFF), null), [])
  assert.deepEqual(switchProblems(site(ON), STORE), [])
})

test('switchProblems off: anything that shows the extension fails', () => {
  const leaks: Record<string, string>[] = [
    { 'extension/index.html': 'page' },
    { 'hashmap.json': '{"extension_index.md":"x"}' },
    { 'sitemap.xml': LOC },
    { 'assets/player-640.abc.webp': 'x' },
    { 'extension/goodbye.html': 'Reinstall the extension' },
    { '@localSearchIndexroot.js': '"extension/#how-it-works"' },
    { 'guide/getting-started.html': 'href="/extension/"' },
    { 'bpm-to-ms.html': `href="${STORE}"` },
    { 'metronome.html': `<a class="ext-install-btn" href="">Add to Chrome</a>` },
    { 'index.html': 'Live BPM Detector' },
    { 'index.html': `${NAV} Developer Docs ext-band` },
    { 'index.html': `${NAV} Chrome extension for the music in your tabs` },
    { 'llms.txt': LLMS_LINE },
    { 'live-bpm-detector-share.png': 'x' },
    { 'tap-tempo.html': `${NAV} "name":"Live BPM Detector"` },
    { 'bpm-to-ms.html': OG_IMAGE },
  ]
  for (const leak of leaks) {
    assert.notDeepEqual(switchProblems(site({ ...OFF, ...leak }), null), [], JSON.stringify(leak))
  }
})

test('switchProblems on: a dead or wrong install link fails', () => {
  for (const button of ['<a class="ext-install-btn" href="">', '<a class="ext-install-btn" href="null">', '<a class="ext-install-btn">']) {
    const page = `${ON['extension/index.html']} ${button}`
    assert.notDeepEqual(switchProblems(site({ ...ON, 'extension/index.html': page }), STORE), [], button)
  }
  const wrong = { ...ON, 'extension/goodbye.html': '<a href="https://chromewebstore.google.com/detail/other">Reinstall the extension</a>' }
  assert.notDeepEqual(switchProblems(site(wrong), STORE), [])
  assert.notDeepEqual(switchProblems(site({ ...ON, 'extension/index.html': 'no button' }), STORE), [])
})

test('switchProblems on: the page must be built, indexable, and sized', () => {
  const { 'extension/index.html': page = '', ...withoutPage } = ON
  assert.notDeepEqual(switchProblems(site(withoutPage), STORE), [])
  const variants = [
    page.replace('<title>Live BPM Detector</title>', ''),
    `${page} noindex`,
    page.replace('"@type":"SoftwareApplication",', ''),
    page.replace('width="1280" ', ''),
    page.replace('player-1280.abc', 'missing'),
    page.replace('"price":"0"', ''),
    page.replace('<h1>Live BPM Detector</h1>', ''),
    `${page} "aggregateRating"`,
    page.replace(OG_IMAGE, ''),
    page.replace('content="Live BPM Detector: x"', 'content="Live BPM Detector: x | Realtime BPM Analyzer"'),
    `${page}<meta property="og:image" content="x">`,
  ]
  for (const variant of variants) {
    assert.notDeepEqual(switchProblems(site({ ...ON, 'extension/index.html': variant }), STORE), [], variant)
  }
  assert.notDeepEqual(switchProblems(site({ ...ON, 'assets/player-1280.abc.webp': 'x'.repeat(40_001) }), STORE), [])
})

test('switchProblems on: only the page\'s screenshots are held to the image rules', () => {
  const page = ON['extension/index.html'] ?? ''
  const logo = '<img class="VPImage logo" src="/logo.svg" alt>'
  assert.deepEqual(switchProblems(site({ ...ON, 'extension/index.html': `${logo}${page}` }), STORE), [])
  assert.notDeepEqual(switchProblems(site({ ...ON, 'extension/index.html': page.replace(IMG, '') }), STORE), [])
})

test('switchProblems on: an image Vite inlined needs no file, but stays small and sized', () => {
  const page = ON['extension/index.html'] ?? ''
  const inlined = (data: string, size = 'width="487" height="203" ') =>
    `<img class="ext-shot" src="data:image/webp;base64,${data}" ${size}alt="A picture">`
  const withImage = (img: string) => site({ ...ON, 'extension/index.html': `${page}${img}` })
  assert.deepEqual(switchProblems(withImage(inlined('AAAA')), STORE), [])
  assert.notDeepEqual(switchProblems(withImage(inlined('A'.repeat(40_001))), STORE), [])
  assert.notDeepEqual(switchProblems(withImage(inlined('AAAA', '')), STORE), [])
})

test('the committed value is never the check\'s fixture', () => {
  assert.notEqual(EXTENSION_STORE_URL, FIXTURE_STORE_URL)
})

test('switchProblems on: the promo stays where it belongs', () => {
  const broken: Record<string, string>[] = [
    { 'sitemap.xml': '' },
    { 'sitemap.xml': `${LOC} extension/welcome` },
    { 'llms.txt': '' },
    { 'llms.txt': `## Library ${LLMS_LINE}` },
    { 'live-bpm-detector-share.png': 'x'.repeat(300_001) },
    { 'index.html': `${NAV_ON} Developer Docs Live BPM Detector for Chrome` },
    { 'index.html': `${NAV_ON} Developer Docs ext-band` },
    { 'index.html': `${NAV_ON} Developer Docs Live BPM Detector for Chrome ext-band` },
    { 'index.html': `${NAV_ON} Live BPM Detector for Chrome ext-band` },
    { 'index.html': `${NAV_ON} Developer Docs Live BPM Detector for Chrome ext-band ${OG_IMAGE}` },
    { 'bpm-to-ms.html': `${NAV} href="/extension/"` },
    { 'tap-tempo.html': NAV_ON },
    { 'guide/getting-started.html': `${NAV_ON} Live BPM Detector` },
    { 'bpm-to-ms.html': `${NAV_ON} Live BPM Detector` },
  ]
  for (const change of broken) {
    assert.notDeepEqual(switchProblems(site({ ...ON, ...change }), STORE), [], JSON.stringify(change))
  }
  const { 'live-bpm-detector-share.png': _image, ...noImage } = ON
  assert.notDeepEqual(switchProblems(site(noImage), STORE), [])
})
