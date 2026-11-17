// Run with `npm test`. The built-site checks catch what they claim to catch.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HOME_H1, NOT_IN_SITEMAP, seoProblems } from './seo-output.ts'
import type { BuiltSite } from './extension-switch.ts'
import { SITE_DESCRIPTION } from '../.vitepress/tools/page-description.ts'

const SITE = 'https://www.realtime-bpm-analyzer.com'
const TIME = '<time datetime="2026-11-03T10:00:00.000Z" data-v-1>November 3, 2026</time>'
const DATES = '"datePublished":"2025-02-01T09:00:00.000Z","dateModified":"2026-11-03T10:00:00.000Z"'
const GUIDE = `<meta property="og:type" content="article"><script type="application/ld+json">{"@graph":[{"@type":"TechArticle",${DATES}}]}</script><p>Last updated: ${TIME}</p>`
const NOINDEX = '<meta name="robots" content="noindex">'
const GUIDES = ['node', 'getting-started', 'how-it-works', 'performance', 'react-bpm-hook', 'cli', 'mcp', 'java', 'python', 'csharp', 'swift']
const canonical = (url: string) => `<link rel="canonical" href="${SITE}${url}">`
const description = (text: string) => `<meta name="description" content="${text}">`
const sitemap = (urls: readonly string[]) => urls.map((url) => `<url><loc>${SITE}${url}</loc></url>`).join('')
// The clean URLs of the fixture's indexable pages, all in its sitemap by default.
const LISTED = ['/', '/website-privacy', ...GUIDES.map((name) => `/guide/${name}`)]

function site(overrides: Record<string, string> = {}): BuiltSite {
  const files: Record<string, string> = {
    'index.html': `${canonical('/')}${description('Find the BPM of a song')}<h1 class="heading"><!--[--><span class="text">${HOME_H1}</span></h1><p>Maintained by David Lepaux. Last updated ${TIME}.</p>`,
    'sitemap.xml': sitemap(LISTED),
    'website-privacy.html': `${canonical('/website-privacy')}${description('What the site measures')}<p>privacy</p>`,
    '404.html': '<h1>Page not found</h1>',
    'guide/quick-start.html': '<meta http-equiv="refresh" content="0; url=/guide/getting-started">',
    ...Object.fromEntries(GUIDES.map((name) => [`guide/${name}.html`, `${canonical(`/guide/${name}`)}${description(`The ${name} guide`)}${GUIDE}`])),
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

// Since the noindex flip (contributing.md, "First publish of v6", step 13) the CLI and MCP
// guides are held to every guide's rules: indexable, in the sitemap, an article with its dates.
test('seoProblems: the CLI and MCP guides are guides like the others', () => {
  const noindex = site({ 'guide/cli.html': `${NOINDEX}${canonical('/guide/cli')}${GUIDE}`, 'sitemap.xml': sitemap(LISTED.filter((url) => url !== '/guide/cli')) })
  assert.deepEqual(seoProblems(noindex), ['guide/cli.html: noindex'])
  const undated = site({ 'guide/mcp.html': `${canonical('/guide/mcp')}<meta property="og:type" content="article"><p>mcp</p>` })
  assert.match(seoProblems(undated).join(), /guide\/mcp\.html: no TechArticle,guide\/mcp\.html: no datePublished/)
  const unlisted = site({ 'sitemap.xml': sitemap(LISTED.filter((url) => url !== '/guide/mcp')) })
  assert.deepEqual(seoProblems(unlisted), ['guide/mcp.html: indexable but not in the sitemap'])
})

// Since the 6.2 ports' noindex flip (contributing.md, "First publish of the 6.2 ports", step 8)
// the Java and Python guides are held to every guide's rules too.
test('seoProblems: the Java and Python guides are guides like the others', () => {
  const noindex = site({ 'guide/java.html': `${NOINDEX}${canonical('/guide/java')}${GUIDE}`, 'sitemap.xml': sitemap(LISTED.filter((url) => url !== '/guide/java')) })
  assert.deepEqual(seoProblems(noindex), ['guide/java.html: noindex'])
  const undated = site({ 'guide/python.html': `${canonical('/guide/python')}<meta property="og:type" content="article"><p>python</p>` })
  assert.match(seoProblems(undated).join(), /guide\/python\.html: no TechArticle,guide\/python\.html: no datePublished/)
  const unlisted = site({ 'sitemap.xml': sitemap(LISTED.filter((url) => url !== '/guide/python')) })
  assert.deepEqual(seoProblems(unlisted), ['guide/python.html: indexable but not in the sitemap'])
})

// Since their publish flip (RBA-272) the C# and Swift guides are held to every guide's rules too.
test('seoProblems: the C# and Swift guides are guides like the others', () => {
  const noindex = site({ 'guide/csharp.html': `${NOINDEX}${canonical('/guide/csharp')}${GUIDE}`, 'sitemap.xml': sitemap(LISTED.filter((url) => url !== '/guide/csharp')) })
  assert.deepEqual(seoProblems(noindex), ['guide/csharp.html: noindex'])
  const undated = site({ 'guide/swift.html': `${canonical('/guide/swift')}<meta property="og:type" content="article"><p>swift</p>` })
  assert.match(seoProblems(undated).join(), /guide\/swift\.html: no TechArticle,guide\/swift\.html: no datePublished/)
  const unlisted = site({ 'sitemap.xml': sitemap(LISTED.filter((url) => url !== '/guide/swift')) })
  assert.deepEqual(seoProblems(unlisted), ['guide/swift.html: indexable but not in the sitemap'])
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
  const folderListed = site({ 'tools/index.html': `${canonical('/tools/')}${description('Tools')}<h1>Tools</h1>`, 'sitemap.xml': sitemap([...LISTED, '/tools/']) })
  assert.deepEqual(seoProblems(folderListed), [])
})

test('seoProblems: a page in the sitemap that is noindex fails, in either attribute order', () => {
  const tagged = site({ 'website-privacy.html': `${canonical('/website-privacy')}${description('What the site measures')}<meta content="noindex, nofollow" name="robots">` })
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

// RBA-268: the API reference and the copied root files all carried the site's description.
test('seoProblems: every page in the sitemap has a description of its own', () => {
  const fallback = site({ 'website-privacy.html': `${canonical('/website-privacy')}${description(SITE_DESCRIPTION)}` })
  assert.deepEqual(seoProblems(fallback), ["website-privacy.html: the site's default meta description"])
  const shared = site({ 'website-privacy.html': `${canonical('/website-privacy')}${description('Find the BPM of a song')}` })
  assert.deepEqual(seoProblems(shared), [
    'index.html: the same meta description as website-privacy.html',
    'website-privacy.html: the same meta description as index.html',
  ])
  const none = site({ 'guide/node.html': `${canonical('/guide/node')}${GUIDE}` })
  assert.deepEqual(seoProblems(none), ['guide/node.html: no meta description'])
  // Either attribute order.
  const reversed = site({ 'website-privacy.html': `${canonical('/website-privacy')}<meta content="${SITE_DESCRIPTION}" name="description">` })
  assert.deepEqual(seoProblems(reversed), ["website-privacy.html: the site's default meta description"])
})
