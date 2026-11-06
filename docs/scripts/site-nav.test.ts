// Run with `npm test`. The top navigation (RBA-66): musician-first, one Developers menu,
// and every extension link gated on the store switch like the rest of the promotion.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { DefaultTheme } from 'vitepress'
import { siteNav } from '../.vitepress/tools/site-nav.ts'

const LISTING = `https://chromewebstore.google.com/detail/live-bpm-detector/${'a'.repeat(32)}`
const VERSION = '5.6.1'
const CHANGELOG = 'https://github.com/dlepaux/realtime-bpm-analyzer/blob/main/packages/realtime-bpm-analyzer/changelog.md'

type Entry = { text?: string; link?: string; items?: readonly Entry[]; activeMatch?: string }

const entries = (nav: readonly DefaultTheme.NavItem[]) => nav as readonly Entry[]
const menu = (nav: readonly DefaultTheme.NavItem[], text: string): Entry => {
  const found = entries(nav).find((item) => item.text === text)
  assert.ok(found, `no ${text} menu`)
  return found
}
/** Every link in a menu tree, depth first, as [text, link]. */
const links = (items: readonly Entry[]): [string | undefined, string][] =>
  items.flatMap((item) => [
    ...(item.link === undefined ? [] : [[item.text, item.link] as [string | undefined, string]]),
    ...links(item.items ?? []),
  ])
const hrefs = (nav: readonly DefaultTheme.NavItem[]) => links(entries(nav)).map(([, link]) => link)

// VitePress tests activeMatch against the page's path with a leading slash and no .md:
// guide/getting-started.md is /guide/getting-started, api/index.md is /api/.
const highlights = (activeMatch: string | undefined, path: string) =>
  activeMatch !== undefined && new RegExp(activeMatch).test(path)

test('the top level is musician-first: tools, the extension, then Developers and About', () => {
  assert.deepEqual(entries(siteNav(LISTING, VERSION)).map((item) => item.text), ['Free Tools', 'Browser Extension', 'Developers', 'About'])
})

test('switch off: no extension entry anywhere in the nav', () => {
  const nav = siteNav(null, VERSION)
  assert.deepEqual(entries(nav).map((item) => item.text), ['Free Tools', 'Developers', 'About'])
  assert.deepEqual(hrefs(nav).filter((link) => link.startsWith('/extension/')), [])
})

test('switch on: the extension page and its privacy page are both linked', () => {
  const nav = siteNav(LISTING, VERSION)
  assert.deepEqual(entries(nav)[1], { text: 'Browser Extension', link: '/extension/', activeMatch: '^/extension/$' })
  assert.deepEqual(links(menu(nav, 'About').items ?? []).find(([, link]) => link === '/extension/privacy'), ['Extension privacy', '/extension/privacy'])
})

test('Free Tools keeps its six tools, in order', () => {
  assert.deepEqual(links(menu(siteNav(LISTING, VERSION), 'Free Tools').items ?? []), [
    ['BPM Analyzer', '/'],
    ['Tap Tempo', '/tap-tempo'],
    ['BPM to ms Calculator', '/bpm-to-ms'],
    ['Video BPM Finder', '/video-bpm'],
    ['BPM to Frames Calculator', '/bpm-to-frames'],
    ['Metronome', '/metronome'],
  ])
})

test('Developers holds the library: guide, examples, API, and the changelog under the version', () => {
  const developers = menu(siteNav(null, VERSION), 'Developers')
  assert.deepEqual(links(developers.items ?? []), [
    ['Library guide', '/guide/getting-started'],
    ['Examples', '/examples/basic-usage'],
    ['API reference', '/api/'],
    ['Changelog', CHANGELOG],
  ])
  const version = (developers.items ?? []).find((item) => item.items !== undefined)
  assert.equal(version?.text, 'v5.6.1', 'the version heads the changelog section')
  assert.equal(menu(siteNav(null, '6.0.0'), 'Developers').items?.find((item) => item.items)?.text, 'v6.0.0', 'the version is read, not written in')
})

const OUTSIDE_THE_LIBRARY = ['/', '/tap-tempo', '/extension/', '/extension/privacy', '/privacy', '/website-privacy', '/contributing', '/guides']

test('Developers highlights on every library page and nowhere else', () => {
  const { activeMatch } = menu(siteNav(LISTING, VERSION), 'Developers')
  // The unlinked CLI and MCP guides are library pages too, so they light it up on purpose.
  for (const path of ['/guide/getting-started', '/guide/how-it-works', '/guide/cli', '/guide/mcp', '/api/', '/api/functions/createRealtimeBpmAnalyzer', '/examples/basic-usage', '/examples/react']) {
    assert.ok(highlights(activeMatch, path), `${path} should highlight Developers`)
  }
  for (const path of OUTSIDE_THE_LIBRARY) {
    assert.ok(!highlights(activeMatch, path), `${path} should not highlight Developers`)
  }
})

// A group with an activeMatch makes VitePress test each child's link as a regex too
// (VPNavBarMenuGroup's isChildActive), so a child linking to '/' would light Developers everywhere.
test('no Developers link, read as a regex, lights it up outside the library', () => {
  for (const [, link] of links(menu(siteNav(LISTING, VERSION), 'Developers').items ?? [])) {
    for (const path of OUTSIDE_THE_LIBRARY) {
      assert.ok(!highlights(link, path), `${link} matches ${path}`)
    }
  }
})

test('About holds the policies and the project pages', () => {
  assert.deepEqual(links(menu(siteNav(LISTING, VERSION), 'About').items ?? []), [
    ['Website privacy', '/website-privacy'],
    ['Extension privacy', '/extension/privacy'],
    ['Library privacy', '/privacy'],
    ['Security', '/security'],
    ['Contributing', '/contributing'],
    ['Code of Conduct', '/code-of-conduct'],
  ])
  assert.deepEqual(links(menu(siteNav(null, VERSION), 'About').items ?? []).map(([text]) => text), ['Website privacy', 'Library privacy', 'Security', 'Contributing', 'Code of Conduct'])
})

test('everything the old version menu held is still in the nav', () => {
  const nav = hrefs(siteNav(LISTING, VERSION))
  for (const link of [CHANGELOG, '/contributing', '/code-of-conduct', '/security', '/privacy', '/website-privacy', '/extension/privacy']) {
    assert.ok(nav.includes(link), `${link} is no longer in the nav`)
  }
})

test('no page is linked twice', () => {
  for (const storeUrl of [null, LISTING]) {
    const nav = hrefs(siteNav(storeUrl, VERSION))
    assert.deepEqual(nav, [...new Set(nav)])
  }
})

test('the v6-only pages stay off the nav on main until their npm release (RBA-122)', () => {
  const nav = hrefs(siteNav(LISTING, VERSION))
  assert.deepEqual(nav.filter((link) => /cli|mcp|migration-v6/.test(link)), [])
})
