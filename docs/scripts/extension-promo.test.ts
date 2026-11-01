// Run with `npm test`. The switch's logic, and the claims rule on the page's own text.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EXTENSION_STORE_URL } from '../.vitepress/tools/extension-config.ts'
import {
  excludedSources,
  extensionHomeFeatures,
  extensionNavItems,
  extensionPageSchema,
  installTargets,
  resolveStoreUrl,
} from '../.vitepress/tools/extension-promo.ts'

const LISTING = `https://chromewebstore.google.com/detail/live-bpm-detector/${'a'.repeat(32)}`

// Markdown down to the words a reader sees, on one line.
function plainText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
}

const pageSource = readFileSync(new URL('../extension/index.md', import.meta.url), 'utf8')
const page = plainText(pageSource)
const policySource = readFileSync(new URL('../extension/privacy.md', import.meta.url), 'utf8')

test('resolveStoreUrl: null stays off, a listing passes, without its query', () => {
  assert.equal(resolveStoreUrl(null), null)
  assert.equal(resolveStoreUrl(LISTING), LISTING)
  assert.equal(resolveStoreUrl(`${LISTING}/`), LISTING)
  assert.equal(resolveStoreUrl(`${LISTING}?hl=en&authuser=0`), LISTING)
  const noSlug = `https://chromewebstore.google.com/detail/${'b'.repeat(32)}`
  assert.equal(resolveStoreUrl(noSlug), noSlug)
})

test('resolveStoreUrl: anything else fails the build rather than ship a dead link', () => {
  for (const raw of [
    '', ' ', '#', 'TODO', 'null', '/extension/', 'https://example.com',
    'http://chromewebstore.google.com/detail/live-bpm-detector/' + 'a'.repeat(32),
    'https://chromewebstore.google.com/detail/live-bpm-detector',
    'https://chromewebstore.google.com/detail/live-bpm-detector/placeholder',
    'https://chromewebstore.google.com.evil.example/detail/' + 'a'.repeat(32),
    'javascript:alert(1)',
  ]) {
    assert.throws(() => resolveStoreUrl(raw), /EXTENSION_STORE_URL/, raw)
  }
})

test('the committed value is off or a real listing', () => {
  assert.doesNotThrow(() => resolveStoreUrl(EXTENSION_STORE_URL))
})

test('switch off: nothing to render, and the page is left out of the build', () => {
  assert.deepEqual(installTargets(null), [])
  assert.deepEqual(extensionNavItems(null), [])
  assert.deepEqual(extensionHomeFeatures(null), [])
  assert.deepEqual(excludedSources(null), ['extension/index.md'])
})

test('switch on: every install link is the listing, and the page is built', () => {
  const targets = installTargets(LISTING)
  assert.ok(targets.length > 0)
  for (const target of targets) assert.equal(target.href, LISTING)
  assert.deepEqual(excludedSources(LISTING), [])
  assert.deepEqual(extensionNavItems(LISTING).map((item) => item.link), ['/extension/'])
  assert.deepEqual(extensionHomeFeatures(LISTING).map((item) => item.link), ['/extension/'])
})

test('structured data: names the listing, with no price or rating', () => {
  const schema = extensionPageSchema(LISTING, 'https://x/extension/', 'Description')
  assert.equal(schema.installUrl, LISTING)
  assert.ok(!('offers' in schema) && !('aggregateRating' in schema))
})

test('page: the privacy text is the policy\'s own words, none of them dropped', () => {
  const start = page.indexOf('## Your audio never leaves your device')
  const end = page.indexOf('## Questions')
  assert.ok(start > 0 && end > start)
  const section = page.slice(start, end)
  const from = policySource.indexOf('## Your audio never leaves your device')
  const to = policySource.indexOf('## Chrome Web Store Limited Use')
  assert.ok(from > 0 && to > from)
  const blocks = policySource.slice(from, to).split(/\n\n|\n(?=- )/).map((block) => plainText(block.replace(/^(?:#+|-) /, '')).trim())
  assert.ok(blocks.length >= 9)
  for (const block of blocks) assert.ok(section.includes(block), `missing from the page: ${block}`)
})

test('page: states the listing\'s limits', () => {
  for (const limit of [
    'It looks for tempos from 90 to about 178 BPM. Faster music reads at half and slower music at double: 200 shows as 100, 70 as 140.',
    'the old tempo can stay on screen, still marked stable, for about 20 seconds after the music changes.',
    'The new tempo can take longer again to settle, and may be wrong at first.',
    'Stable means the reading has settled, not that it is certainly right.',
    'Once it has one, that number stays on screen through a pause or silence, and a stable one stays marked stable.',
    'This extension is independent, and is not affiliated with or endorsed by any of these services.',
    'Chrome\'s install prompt says "Read and change all your data on all websites"',
  ]) {
    assert.ok(page.includes(limit), limit)
  }
})

test('page: names exactly the sites the player matrix and the listing prove', () => {
  const sites = [...pageSource.matchAll(/<li>([^<]+)<\/li>/g)].map((match) => match[1])
  assert.deepEqual(new Set(sites), new Set(['YouTube', 'YouTube Music', 'Twitch', 'SoundCloud', 'Bandcamp', 'Mixcloud']))
})

test('page: makes no claim the evidence does not carry', () => {
  for (const banned of [
    /accura/i, /benchmark/i, /\d\s*%/, /\bbest\b/i, /\bfastest\b/i, /\bperfect/i, /\bguarantee/i,
    /coming soon/i, /\bsoon\b/i, /\bPro\b/, /pric(e|ing)/i, /\bfree\b/i, /\bpaid\b/i, /\$/,
    /GroovePeek/, /BPM Finder/, /BPM Counter/, /Spotify/, /Deezer/, /Vimeo/, /Firefox/, /\bEdge\b/, /Safari/,
    /collects no data/i,
    /—/, /–/,
  ]) {
    assert.ok(!banned.test(page), `the page matches ${banned}`)
  }
})
