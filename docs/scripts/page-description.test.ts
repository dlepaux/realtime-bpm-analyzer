// Run with `npm test`. Which pages without a frontmatter description get one of their own.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { fallbackDescription } from '../.vitepress/tools/page-description.ts'

test('fallbackDescription: each copied root file gets its own, and the file exists', () => {
  const pages = ['privacy.md', 'security.md', 'contributing.md', 'code-of-conduct.md']
  const descriptions = pages.map((page) => fallbackDescription(page, ''))
  for (const [index, page] of pages.entries()) {
    assert.ok(descriptions[index], `${page} has no description`)
    // copy:markdown copies them from the repository root: a renamed file would lose its line silently.
    assert.ok(existsSync(new URL(`../../${page}`, import.meta.url)), `../${page} is not at the root`)
  }
  assert.equal(new Set(descriptions).size, pages.length)
})

test('fallbackDescription: API pages are described by their own title', () => {
  assert.match(fallbackDescription('api/index.md', 'realtime-bpm-analyzer') ?? '', /^API reference of realtime-bpm-analyzer/)
  assert.equal(
    fallbackDescription('api/functions/analyzeFullBuffer.md', 'Function: analyzeFullBuffer()'),
    'Function: analyzeFullBuffer(), in the API reference of realtime-bpm-analyzer, generated from its TypeScript source.',
  )
  assert.equal(fallbackDescription('api/functions/x.md', '  '), undefined)
})

test('fallbackDescription: every other page keeps the frontmatter route', () => {
  for (const page of ['index.md', 'guide/node.md', 'tap-tempo.md', 'website-privacy.md']) {
    assert.equal(fallbackDescription(page, 'Title'), undefined)
  }
})
