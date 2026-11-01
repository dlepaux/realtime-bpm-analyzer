// Run with `npm test`. The switch's logic, and the claims rule on the page's own text.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EXTENSION_STORE_URL } from '../.vitepress/tools/extension-config.ts'
import {
  EXTENSION_HERO_TAGLINE,
  EXTENSION_LLMS_LINE,
  EXTENSION_SHARE_IMAGE,
  excludedSources,
  extensionCovers,
  extensionHeroActions,
  extensionHomeHero,
  llmsWithExtension,
  sharePageLink,
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

const BANNED_CLAIMS = [
  /accura/i, /benchmark/i, /\d\s*%/, /\bbest\b/i, /\bfastest\b/i, /\bperfect/i, /\bguarantee/i,
  /coming soon/i, /\bsoon\b/i, /\bPro\b/, /pric(e|ing)/i, /\bforever\b/i, /\bpaid\b/i, /aggregateRating/, /testimonial/i, /\d\S*\s+installs\b/i, /\busers\b/i,
  /GroovePeek/, /BPM Finder/, /BPM Counter/, /Spotify/, /Deezer/, /Vimeo/, /Firefox/, /\bEdge\b/, /Safari/,
  /collects no data/i,
  /—/, /–/,
]

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
  assert.deepEqual(extensionHeroActions(null), [])
  assert.deepEqual(excludedSources(null), ['extension/index.md'])
})

test('switch on: every install link is the listing, and the page is built', () => {
  const targets = installTargets(LISTING)
  assert.ok(targets.length > 0)
  for (const target of targets) assert.equal(target.href, LISTING)
  assert.deepEqual(excludedSources(LISTING), [])
  assert.deepEqual(extensionNavItems(LISTING).map((item) => item.link), ['/extension/'])
  assert.deepEqual(extensionHeroActions(LISTING).map((item) => item.link), ['/extension/'])
})

test('structured data: names the listing and says it is free, with no rating or review', () => {
  const schema = extensionPageSchema(LISTING, 'https://x/extension/', 'Description')
  assert.equal(schema.installUrl, LISTING)
  assert.equal(schema.offers.price, '0')
  for (const key of ['aggregateRating', 'review', 'browserRequirements']) assert.ok(!(key in schema), key)
})

test('the analyzer only suggests the extension for links to sites the listing names', () => {
  for (const platform of ['youtube', 'soundcloud', 'bandcamp']) assert.ok(extensionCovers(platform), platform)
  for (const platform of ['spotify', 'apple_music', 'deezer', null]) assert.ok(!extensionCovers(platform), String(platform))
})

// The page carries only this much of the policy, so musicians reach the install button,
// and links to the rest. Headings are written at the policy's level.
const KEPT_FROM_POLICY = [
  '## Your audio never leaves your device',
  'When you click the extension\'s button on a tab, it listens to that tab\'s audio and works out the tempo on your computer. The audio is not recorded, stored or sent anywhere. Nobody, including us, can hear it or receive it.',
  '## What the extension sends',
  'The extension makes no network request of its own, contains no analytics and has no account, install id or advertising. We don\'t sell or share your audio or tab information: it never reaches us.',
  '## The website pages it opens',
  'The pages are part of the website, which uses Google Analytics as described in Website Privacy, so a visit to one of them is measured like any other visit.',
]
const POLICY_LINK = 'Read the full extension privacy policy.'

test('page: every kept privacy sentence is word for word in the policy', () => {
  const policy = plainText(policySource)
  for (const kept of KEPT_FROM_POLICY) assert.ok(policy.includes(kept), `not in the policy: ${kept}`)
})

test('page: the privacy section is exactly the kept sentences and the link to the policy', () => {
  const start = page.indexOf('## Your audio never leaves your device')
  const end = page.indexOf('## Questions')
  assert.ok(start > 0 && end > start)
  const section = page.slice(start, end)
    .replace(/<[^>]+>/g, ' ')
    .replace(/#+ /g, '## ')
    .replace(/\s+/g, ' ')
    .trim()
  assert.equal(section, [...KEPT_FROM_POLICY, POLICY_LINK].join(' '))
  assert.ok(pageSource.includes('[extension privacy policy](/extension/privacy)'), 'the link to the full policy is gone')
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
  for (const banned of [...BANNED_CLAIMS, /\$/]) assert.ok(!banned.test(page), `the page matches ${banned}`)
})

test('the promotion outside the page makes the same claims only', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
  // Copy only: the template, because the script holds comments, without its style bindings.
  const copy = (path: string) => read(path).slice(read(path).indexOf('<template>')).replace(/:style="[^"]*"/g, '')
  const lines = (path: string) => read(path).split('\n').filter((line) => line.includes('ExtensionMention lead')).join(' ')
  const surfaces = {
    band: copy('../.vitepress/components/ExtensionHomeBand.vue'),
    install: copy('../.vitepress/components/ExtensionInstall.vue'),
    demo: copy('../.vitepress/components/ExtensionDemo.vue'),
    tap: lines('../tap-tempo.md'),
    metronome: lines('../metronome.md'),
    tagline: EXTENSION_HERO_TAGLINE,
    llms: EXTENSION_LLMS_LINE,
    shareAlt: EXTENSION_SHARE_IMAGE.alt,
  }
  assert.ok(surfaces.tap.includes('Chrome tab') && surfaces.metronome.includes('Chrome tab'), 'the mentions moved')
  for (const [name, text] of Object.entries(surfaces)) {
    for (const banned of BANNED_CLAIMS) assert.ok(!banned.test(text), `${name} matches ${banned}`)
  }
})

test('extensionHomeHero: off leaves the hero as written, on adds the action first', () => {
  const hero = { tagline: 'As written', actions: [{ text: 'Developer Docs' }] }
  assert.equal(extensionHomeHero(hero, null), hero)
  const on = extensionHomeHero(hero, LISTING)
  assert.equal(on.actions.length, 2)
  assert.deepEqual(on.actions[1], hero.actions[0])
  assert.equal(on.tagline, EXTENSION_HERO_TAGLINE)
  assert.equal(hero.actions.length, 1, 'the source hero is not mutated')
})

test('llmsWithExtension: the real file gains the extension ahead of the library', () => {
  const llms = readFileSync(new URL('../public/llms.txt', import.meta.url), 'utf8')
  const result = llmsWithExtension(llms)
  assert.ok(result.indexOf(EXTENSION_LLMS_LINE) < result.indexOf('## Library'))
  assert.ok(result.split('\n')[2].includes('Chrome extension'), 'the summary names it')
  assert.throws(() => llmsWithExtension('# moved'))
})

test('sharePageLink: falls back to the link, ignores a closed sheet, mails on a failure', async () => {
  let mailed = 0
  const mail = () => { mailed += 1 }
  assert.equal(sharePageLink(undefined, mail), false)
  assert.equal(sharePageLink(() => Promise.resolve(), mail), true)
  assert.equal(sharePageLink(() => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' })), mail), true)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(mailed, 0)
  sharePageLink(() => Promise.reject(new Error('blocked')), mail)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(mailed, 1)
})
