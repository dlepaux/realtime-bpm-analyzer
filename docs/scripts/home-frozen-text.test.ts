// Run with `npm test`. The home's ranking text is frozen while its layout changes (RBA-66, PR 1):
// search traffic is read against the 2026-11-03 title and H1 change, so a word changed here would
// leave a traffic move with two causes. The rewording comes in PR 2, after 2026-12-01, with the
// rendered-text diff in that PR; it updates these pins in the same change, never alone.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { EXTENSION_HERO_TAGLINE } from '../.vitepress/tools/extension-promo.ts'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const HOME = read('../index.md')
const CONFIG = read('../.vitepress/config.ts')

// The words a reader sees in a stretch of the page: no markup, no wrappers, one line.
function words(markdown: string): string {
  return markdown
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s*- /gm, ' ')
    .replace(/\*\*|`/g, '')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The words from `heading` up to the next heading of the same level, or the end. */
function section(heading: string): string {
  const start = HOME.indexOf(`\n${heading}\n`)
  assert.ok(start !== -1, `the home has no ${heading}`)
  const level = heading.split(' ')[0]
  const next = HOME.indexOf(`\n${level} `, start + heading.length + 1)
  return words(HOME.slice(start, next === -1 ? undefined : next))
}

const sha = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16)
const frontmatter = (key: string) => HOME.match(new RegExp(`^\\s*${key}: (.+)$`, 'm'))?.[1]?.replace(/^"|"$/g, '')

test('the title, the H1 and the meta description are word for word', () => {
  assert.equal(frontmatter('title'), 'BPM Finder: Find the BPM of Any Song')
  assert.equal(frontmatter('text'), 'BPM Finder: Find the BPM of Any Song')
  assert.equal(frontmatter('description'), 'Find the BPM of any song in your browser. This free BPM detector reads a file, the microphone or a stream, and your audio never leaves your device.')
})

test('the taglines are word for word, with the switch off and on', () => {
  assert.equal(frontmatter('tagline'), 'A free BPM detector that runs in your browser. Drop a song, use the microphone or play a stream, and your audio stays on your device. Also a zero-dependency TypeScript library for developers.')
  assert.equal(EXTENSION_HERO_TAGLINE, 'Free BPM detection in your browser, and your audio stays on your device. Also an extension for Chrome and Edge, for the music in your tabs.')
})

test('the site default description is word for word', () => {
  assert.match(CONFIG, /\n {2}description: "Realtime BPM detection library for the browser — file, microphone, and stream audio\. AudioWorklet-native, zero dependencies, TypeScript-first\. Includes a free online BPM tool\.",\n/)
})

// Pinned by hash: a copy of each section here would be a second place to edit by mistake.
const FROZEN_SECTIONS: readonly (readonly [string, string])[] = [
  ['## Find the BPM of a song', 'FIND'],
  ['## Limits', 'LIMITS'],
  ['## What is BPM?', 'WHAT'],
  ['## Who is it for?', 'WHO'],
  ['## Frequently asked questions', 'FAQ'],
  ['## For developers', 'DEV'],
]

// Taken from main at 4c25a8f, before the layout change.
const PINS: Readonly<Record<string, string>> = {
  FIND: '118cfd63d08e3898',
  LIMITS: 'f1369c32a1493820',
  WHAT: 'f00c625bf13206bd',
  WHO: '72687c76259beffc',
  FAQ: 'f966ee01825703c9',
  DEV: '86d5c6cf2255b976',
}

test('the sections keep every word, wherever the layout puts them', () => {
  const actual = Object.fromEntries(FROZEN_SECTIONS.map(([heading, key]) => [key, sha(section(heading))]))
  assert.deepEqual(actual, PINS)
})
