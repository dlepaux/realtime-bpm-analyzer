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
  'extension/index.html': `<title>Live BPM Detector</title><meta property="og:title" content="Live BPM Detector: x"><link rel="canonical" href="https://www.realtime-bpm-analyzer.com/extension/">${OG_IMAGE}"@type":"SoftwareApplication","installUrl":"${STORE}","price":"0" <h1>Live BPM Detector</h1> ${BUTTON} <div class="ext-demo"></div>`,
  'extension/goodbye.html': `<a href="${STORE}">Reinstall the extension</a>`,
  'index.html': `${NAV_ON} Developer Docs Live BPM Detector for Chrome ext-home ext-band ext-demo Chrome extension for the music in your tabs`,
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
    { 'extension-demo/dark-stable-1520.webp': 'x' },
    { 'assets/dark-stable-1520.AbCd1234.webp': 'x' },
    { 'index.html': `${NAV} Developer Docs ext-home` },
    { 'metronome.html': `${NAV} <img src="/extension-demo/dark-stable-1520.webp">` },
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

test('switchProblems on: the page must be built and indexable', () => {
  const { 'extension/index.html': page = '', ...withoutPage } = ON
  assert.notDeepEqual(switchProblems(site(withoutPage), STORE), [])
  const variants = [
    page.replace('<title>Live BPM Detector</title>', ''),
    `${page} noindex`,
    page.replace('"@type":"SoftwareApplication",', ''),
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
})

test('switchProblems on: the first screens must show the product', () => {
  const page = ON['extension/index.html'] ?? ''
  const home = ON['index.html'] ?? ''
  assert.notDeepEqual(switchProblems(site({ ...ON, 'extension/index.html': page.replace('ext-demo', '') }), STORE), [])
  assert.notDeepEqual(switchProblems(site({ ...ON, 'index.html': home.replace('ext-demo', '') }), STORE), [])
})

test('switchProblems on: the demo\'s frames are published, sized and small', () => {
  const page = ON['extension/index.html'] ?? ''
  const frame = (attributes = 'width="960" height="610" ') =>
    `<img class="ext-reel-crop" src="/extension-demo/a-800.webp" srcset="/extension-demo/a-800.webp 800w, /extension-demo/a-1520.webp 1520w" ${attributes}alt="">`
  const published = { 'extension-demo/a-800.webp': 'x', 'extension-demo/a-1520.webp': 'x' }
  const build = (files: Record<string, string>, img: string) =>
    site({ ...ON, ...files, 'extension/index.html': `${page} class="ext-reel" <div class="ext-reel-stage" role="img" aria-label="A page">${img}` })
  assert.deepEqual(switchProblems(build(published, frame()), STORE), [])
  assert.notDeepEqual(switchProblems(build(published, frame('')), STORE), [], 'unsized')
  assert.notDeepEqual(switchProblems(build({ 'extension-demo/a-800.webp': 'x' }, frame()), STORE), [], 'a srcset file is missing')
  assert.notDeepEqual(switchProblems(build({ ...published, 'extension-demo/a-1520.webp': 'x'.repeat(250_001) }, frame()), STORE), [], 'too heavy')
  assert.notDeepEqual(switchProblems(build(published, '<img class="ext-reel-wide" src="/other.webp" width="1" height="1">'), STORE), [], 'from elsewhere')
  assert.notDeepEqual(switchProblems(build(published, frame().replace('src="/extension-demo/a-800.webp"', 'src="/other.webp"')), STORE), [], 'src from elsewhere, srcset fine')
  assert.notDeepEqual(switchProblems(build(published, ''), STORE), [], 'no frames')
  const unlabelled = site({ ...ON, ...published, 'extension/index.html': `${page} class="ext-reel" <div class="ext-reel-stage">${frame()}` })
  assert.notDeepEqual(switchProblems(unlabelled, STORE), [], 'no label')
  const home = ON['index.html'] ?? ''
  assert.notDeepEqual(switchProblems(site({ ...ON, 'index.html': home.replace('ext-home ', '') }), STORE), [], 'no home layout')
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
