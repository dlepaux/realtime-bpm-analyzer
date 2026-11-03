// Run with `npm test`. The built-site checks catch what they claim to catch.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HOME_H1, seoProblems } from './seo-output.ts'
import type { BuiltSite } from './extension-switch.ts'

const TIME = '<time datetime="2026-11-03T10:00:00.000Z" data-v-1>November 3, 2026</time>'
const GUIDE = `<meta property="og:type" content="article"><script type="application/ld+json">{"@graph":[{"@type":"TechArticle","dateModified":"2026-11-03T10:00:00.000Z"}]}</script><p>Last updated: ${TIME}</p>`
const NOINDEX = '<meta name="robots" content="noindex">'

function site(overrides: Record<string, string> = {}): BuiltSite {
  const files: Record<string, string> = {
    'index.html': `<h1 class="heading"><!--[--><span class="text">${HOME_H1}</span></h1><p>Maintained by David Lepaux. Last updated ${TIME}.</p>`,
    'sitemap.xml': '<loc>https://www.realtime-bpm-analyzer.com/guide/node</loc>',
    'website-privacy.html': '<p>privacy</p>',
    'guide/cli.html': `${NOINDEX}<a href="/guide/mcp">MCP</a>`,
    'guide/mcp.html': `${NOINDEX}<a href="/guide/cli#formats">CLI</a>`,
    ...Object.fromEntries(['node', 'getting-started', 'how-it-works', 'performance', 'react-bpm-hook'].map((name) => [`guide/${name}.html`, GUIDE])),
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
  const listed = site({ 'sitemap.xml': '<loc>https://www.realtime-bpm-analyzer.com/guide/mcp</loc>' })
  assert.match(seoProblems(listed).join(), /guide\/mcp: in the sitemap/)
  const linked = site({ 'guide/node.html': `${GUIDE}<a href="/guide/cli">CLI</a>` })
  assert.match(seoProblems(linked).join(), /guide\/node\.html: links to an unpublished guide/)
})

test('seoProblems: every other guide is an article with a server-rendered date', () => {
  const bare = site({ 'guide/node.html': '<meta property="og:type" content="website"><time datetime="2026-11-03"></time>' })
  const problems = seoProblems(bare).join()
  for (const expected of [/no TechArticle/, /no dateModified/, /og:type is not article/, /date is empty/]) {
    assert.match(problems, expected)
  }
})

test('seoProblems: no page carries an empty @graph', () => {
  const empty = site({ 'website-privacy.html': '<script type="application/ld+json">{"@context":"https://schema.org","@graph":[]}</script>' })
  assert.match(seoProblems(empty).join(), /website-privacy\.html: an empty @graph/)
})
