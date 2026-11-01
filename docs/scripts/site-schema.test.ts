// Run with `npm test`. Which page carries which schema, and the rules on what the home
// page's FAQ may say.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { HOME_FAQ, SCHEMA_WEB_APPLICATION, isNoindexPage, siteGraph } from '../.vitepress/tools/site-schema.ts'

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
  const pages = ['index.md', 'tap-tempo.md', 'metronome.md', 'bpm-to-ms.md']
    .map((name) => [name, readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')] as const)
  for (const [name, source] of pages) assert.ok(!figure.test(source), name)
  assert.ok(!figure.test(JSON.stringify([HOME_FAQ, SCHEMA_WEB_APPLICATION])))
  assert.ok(figure.test('accurate within **1–2 BPM**'), 'the check itself must catch the old claim')
})

test('isNoindexPage: only the docs readme leaves the sitemap', () => {
  assert.ok(isNoindexPage('readme'))
  assert.ok(isNoindexPage('/readme.html'))
  for (const url of ['', 'guide/readme-tips', 'tap-tempo', 'extension/privacy']) assert.ok(!isNoindexPage(url), url)
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
