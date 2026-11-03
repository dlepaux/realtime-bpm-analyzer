// Run with `npm test`. The built-site checks catch what they claim to catch.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HOME_H1, NOT_IN_SITEMAP, seoProblems } from './seo-output.ts'
import type { BuiltSite } from './extension-switch.ts'

const SITE = 'https://www.realtime-bpm-analyzer.com'
const TIME = '<time datetime="2026-11-03T10:00:00.000Z" data-v-1>November 3, 2026</time>'
const DATES = '"datePublished":"2025-02-01T09:00:00.000Z","dateModified":"2026-11-03T10:00:00.000Z"'
const GUIDE = `<meta property="og:type" content="article"><script type="application/ld+json">{"@graph":[{"@type":"TechArticle",${DATES}}]}</script><p>Last updated: ${TIME}</p>`
const NOINDEX = '<meta name="robots" content="noindex">'
const GUIDES = ['node', 'getting-started', 'how-it-works', 'performance', 'react-bpm-hook']
const canonical = (url: string) => `<link rel="canonical" href="${SITE}${url}">`
const sitemap = (urls: readonly string[]) => urls.map((url) => `<url><loc>${SITE}${url}</loc></url>`).join('')
// The clean URLs of the fixture's indexable pages, all in its sitemap by default.
const LISTED = ['/', '/website-privacy', ...GUIDES.map((name) => `/guide/${name}`)]

function site(overrides: Record<string, string> = {}): BuiltSite {
  const files: Record<string, string> = {
    'index.html': `${canonical('/')}<h1 class="heading"><!--[--><span class="text">${HOME_H1}</span></h1><p>Maintained by David Lepaux. Last updated ${TIME}.</p>`,
    'sitemap.xml': sitemap(LISTED),
    'website-privacy.html': `${canonical('/website-privacy')}<p>privacy</p>`,
    '404.html': '<h1>Page not found</h1>',
    'guide/cli.html': `${NOINDEX}<a href="/guide/mcp">MCP</a>`,
    'guide/mcp.html': `${NOINDEX}<a href="/guide/cli#formats">CLI</a>`,
    'guide/quick-start.html': '<meta http-equiv="refresh" content="0; url=/guide/getting-started">',
    ...Object.fromEntries(GUIDES.map((name) => [`guide/${name}.html`, `${canonical(`/guide/${name}`)}${GUIDE}`])),
    ...overrides,
  }
  return { paths: Object.keys(files), read: (path) => files[path] ?? '', size: (path) => (files[path] ?? '').length }
}

test('seoProblems: a site that follows the rules passes', () => {
  assert.deepEqual(seoProblems(site()), [])
})

test('seoProblems: home needs one h1 holding only the search phrase, and a dated byline', () => {
  const two = site({ 'index.html': `<h1>Realtime BPM Analyzer</h1><h1>${HOME_H1}</h1><p>Maintained by ${TIME}</p>` })
  assert.match(seoProblems(two).join(), /2 h1 elements/)
  const brand = site({ 'index.html': `<h1><span>Realtime BPM Analyzer</span><span>${HOME_H1}</span></h1><p>Maintained by ${TIME}</p>` })
  assert.match(seoProblems(brand).join(), /the h1 reads/)
  const undated = site({ 'index.html': `<h1>${HOME_H1}</h1><p>Maintained by David. <time datetime="2026-11-03"></time></p>` })
  assert.match(seoProblems(undated).join(), /no byline with a date/)
})

test('seoProblems: the unpublished guides stay noindex, out of the sitemap and unlinked', () => {
  assert.match(seoProblems(site({ 'guide/cli.html': '<p>cli</p>' })).join(), /guide\/cli: not noindex/)
  const listed = site({ 'sitemap.xml': sitemap([...LISTED, '/guide/mcp']) })
  assert.match(seoProblems(listed).join(), /guide\/mcp: in the sitemap/)
  const linked = site({ 'guide/node.html': `${canonical('/guide/node')}${GUIDE}<a href="/guide/cli">CLI</a>` })
  assert.match(seoProblems(linked).join(), /guide\/node\.html: links to an unpublished guide/)
})

test('seoProblems: every other guide is an article with a server-rendered date', () => {
  const bare = site({ 'guide/node.html': '<meta property="og:type" content="website"><time datetime="2026-11-03"></time>' })
  const problems = seoProblems(bare).join()
  for (const expected of [/no TechArticle/, /no datePublished/, /no dateModified/, /og:type is not article/, /date is empty/]) {
    assert.match(problems, expected)
  }
})

test('seoProblems: a guide is not published after its last change', () => {
  const later = GUIDE.replace('"datePublished":"2025-02-01', '"datePublished":"2026-12-01')
  assert.match(seoProblems(site({ 'guide/node.html': `${canonical('/guide/node')}${later}` })).join(),
    /guide\/node\.html: datePublished 2026-12-01T09:00:00\.000Z is after dateModified/)
})

test('seoProblems: a page meant to rank that is missing from the sitemap fails', () => {
  const missing = site({ 'sitemap.xml': sitemap(LISTED.filter((url) => url !== '/guide/performance')) })
  assert.deepEqual(seoProblems(missing), ['guide/performance.html: indexable but not in the sitemap'])
  const newPage = site({ 'bpm-to-ms.html': `${canonical('/bpm-to-ms')}<h1>BPM to ms</h1>` })
  assert.deepEqual(seoProblems(newPage), ['bpm-to-ms.html: indexable but not in the sitemap'])
  const folder = site({ 'tools/index.html': `${canonical('/tools/')}<h1>Tools</h1>` })
  assert.deepEqual(seoProblems(folder), ['tools/index.html: indexable but not in the sitemap'])
  const folderListed = site({ 'tools/index.html': `${canonical('/tools/')}<h1>Tools</h1>`, 'sitemap.xml': sitemap([...LISTED, '/tools/']) })
  assert.deepEqual(seoProblems(folderListed), [])
})

test('seoProblems: a page in the sitemap that is noindex fails, in either attribute order', () => {
  const tagged = site({ 'website-privacy.html': `${canonical('/website-privacy')}<meta content="noindex, nofollow" name="robots">` })
  assert.deepEqual(seoProblems(tagged), [`${SITE}/website-privacy: in the sitemap but noindex`])
})

test('seoProblems: every sitemap URL has one canonical, its own, and a built page', () => {
  const other = site({ 'website-privacy.html': `${canonical('/website-privacy.html')}<p>privacy</p>` })
  assert.match(seoProblems(other).join(), /\/website-privacy: canonical is .*\/website-privacy\.html, expected the sitemap URL/)
  const none = site({ 'website-privacy.html': '<p>privacy</p>' })
  assert.match(seoProblems(none).join(), /\/website-privacy: canonical is missing/)
  const two = site({ 'website-privacy.html': `${canonical('/website-privacy')}${canonical('/')}` })
  assert.match(seoProblems(two).join(), /\/website-privacy: canonical is .*, .*expected/)
  const ghost = site({ 'sitemap.xml': sitemap([...LISTED, '/tap-tempo']) })
  assert.deepEqual(seoProblems(ghost), [`sitemap: ${SITE}/tap-tempo has no built page`])
  const offSite = site({ 'sitemap.xml': sitemap(LISTED).replace(`${SITE}/website-privacy`, 'https://realtime-bpm-analyzer.com/website-privacy') })
  assert.match(seoProblems(offSite).join(), /is not on https:\/\/www\./)
})

test('seoProblems: noindex pages, redirect stubs and the listed exclusions stay out of the sitemap without a problem', () => {
  const quiet = site({
    'readme.html': '<meta name="robots" content="noindex, nofollow">',
    'google4e3a3e9414465dcf.html': 'google-site-verification: google4e3a3e9414465dcf.html',
    'examples/01-vanilla-basic/index.html': '<div id="app"></div>',
    'modules.html': '<meta http-equiv="refresh" content="0; url=/api/">',
  })
  assert.deepEqual(seoProblems(quiet), [])
  for (const { reason } of NOT_IN_SITEMAP) assert.ok(reason.length > 10, 'each exclusion says why')
})

test('seoProblems: no page carries an empty @graph', () => {
  const empty = site({ 'website-privacy.html': '<script type="application/ld+json">{"@context":"https://schema.org","@graph":[]}</script>' })
  assert.match(seoProblems(empty).join(), /website-privacy\.html: an empty @graph/)
})
