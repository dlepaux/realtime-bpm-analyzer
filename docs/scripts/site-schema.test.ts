// Run with `npm test`. Which page carries which schema, and the rules on what the home
// page's FAQ may say.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { HOME_FAQ, SCHEMA_WEB_APPLICATION, isGuidePage, isNoindexPage, isUnpublishedGuide, readableDate, siteGraph, techArticle } from '../.vitepress/tools/site-schema.ts'

const types = (path: string) => siteGraph(path).map((node) => (node as { '@type': string })['@type'])

// Markdown down to the words a reader sees, on one line.
function plainText(markdown: string): string {
  return markdown
    .replace(/\*\*|`/g, '')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\s+/g, ' ')
}

const home = plainText(readFileSync(new URL('../index.md', import.meta.url), 'utf8'))

test('siteGraph: the home page names the site, the library, the tool and its FAQ', () => {
  assert.deepEqual(types('index.md'), ['WebSite', 'SoftwareSourceCode', 'WebApplication', 'FAQPage'])
})

test('siteGraph: the library only describes the pages about it', () => {
  for (const path of ['guide/getting-started.md', 'examples/react.md', 'api/index.md']) {
    assert.deepEqual(types(path), ['SoftwareSourceCode'], path)
  }
  for (const path of ['tap-tempo.md', 'metronome.md', 'bpm-to-ms.md', 'contributing.md', 'website-privacy.md', 'extension/privacy.md']) {
    assert.deepEqual(types(path), [], path)
  }
})

test('home FAQ: every question and answer in the markup is on the page, word for word', () => {
  for (const { q, a } of HOME_FAQ) {
    assert.ok(home.includes(q), `not on the page: ${q}`)
    assert.ok(home.includes(a), `not on the page: ${a}`)
  }
})

test('no accuracy figure on the tool pages or in the markup', () => {
  // "within 1-2 BPM" had no measurement behind it. A figure comes back only with one.
  const figure = /within\s+\**\d[^.]*BPM/i
  const pages = ['index.md', 'tap-tempo.md', 'metronome.md', 'bpm-to-ms.md', 'bpm-to-frames.md', 'video-bpm.md']
    .map((name) => [name, readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')] as const)
  for (const [name, source] of pages) assert.ok(!figure.test(source), name)
  assert.ok(!figure.test(JSON.stringify([HOME_FAQ, SCHEMA_WEB_APPLICATION])))
  assert.ok(figure.test('accurate within **1–2 BPM**'), 'the check itself must catch the old claim')
})

test('isNoindexPage: the docs readme and the unpublished guides leave the sitemap', () => {
  for (const url of ['readme', '/readme.html', 'guide/cli', '/guide/mcp.html']) assert.ok(isNoindexPage(url), url)
  for (const url of ['', 'guide/readme-tips', 'guide/node', 'guide/client', 'tap-tempo', 'extension/privacy']) {
    assert.ok(!isNoindexPage(url), url)
  }
})

test('isUnpublishedGuide and isGuidePage: the CLI and MCP guides are not articles until v6', () => {
  assert.ok(isUnpublishedGuide('guide/cli.md') && isUnpublishedGuide('/guide/mcp'))
  assert.ok(!isUnpublishedGuide('guide/node.md'))
  assert.ok(isGuidePage('guide/node.md') && isGuidePage('guide/beat-detection-web-audio.md'))
  for (const path of ['guide/cli.md', 'guide/mcp.md', 'index.md', 'bpm-to-frames.md', 'examples/react.md']) {
    assert.ok(!isGuidePage(path), path)
  }
})

test('techArticle: names the author and publisher, and dates only what git knows', () => {
  const facts = { headline: 'BPM Detection in Node.js', description: 'd', url: 'https://www.realtime-bpm-analyzer.com/guide/node' }
  const dated = techArticle({ ...facts, modified: Date.UTC(2026, 10, 3), published: Date.UTC(2025, 0, 2) })
  assert.equal(dated['@type'], 'TechArticle')
  assert.equal(dated.author.name, 'David Lepaux')
  assert.equal(dated.publisher.name, 'David Lepaux')
  assert.equal(dated.dateModified, '2026-11-03T00:00:00.000Z')
  assert.equal(dated.datePublished, '2025-01-02T00:00:00.000Z')
  // An uncommitted file has no git date: VitePress reports 0 or NaN.
  for (const unknown of [undefined, 0, Number.NaN]) {
    const undated = techArticle({ ...facts, modified: unknown, published: unknown })
    assert.ok(!('dateModified' in undated) && !('datePublished' in undated), String(unknown))
  }
})

test('readableDate: the same words on the server and in any browser time zone', () => {
  assert.equal(readableDate(Date.UTC(2026, 10, 3, 23, 30)), 'November 3, 2026')
  assert.equal(readableDate(0), undefined)
  assert.equal(readableDate(Number.NaN), undefined)
})

test('WebApplication: names its author and publisher, and the video file source', () => {
  assert.equal(SCHEMA_WEB_APPLICATION.author.name, 'David Lepaux')
  assert.equal(SCHEMA_WEB_APPLICATION.publisher.name, 'David Lepaux')
  assert.ok(SCHEMA_WEB_APPLICATION.featureList.some((feature) => feature.includes('the sound track of a video file')))
})

test('no unmeasured tolerance or accuracy praise in the guides', () => {
  // "within ±1 BPM" defines the confidence field, so it stays. A percentage tolerance
  // or a grade of the accuracy would be a claim, and nothing has measured one.
  const claim = /±\s*\d+\s*%|excellent accuracy/i
  const dir = new URL('../guide/', import.meta.url)
  const guides = readdirSync(dir).filter((name) => name.endsWith('.md'))
  assert.ok(guides.length > 5, 'the guides moved')
  for (const name of guides) assert.ok(!claim.test(readFileSync(new URL(name, dir), 'utf8')), name)
})

test('no long dash on home, the video pages or in the home markup', () => {
  // Plain copy rule (RBA-124): a long dash reads as generated text, in the snippet too.
  const dash = /[\u2013\u2014]/
  for (const name of ['index.md', 'video-bpm.md', 'bpm-to-frames.md']) {
    const source = readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')
    for (const [index, line] of source.split('\n').entries()) assert.ok(!dash.test(line), `${name}:${index + 1}`)
  }
  assert.ok(!dash.test(JSON.stringify([HOME_FAQ, SCHEMA_WEB_APPLICATION])))
})
