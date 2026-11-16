// Run with `npm test`. The top navigation (RBA-66): musician-first, one Developers menu,
// and every extension link gated on the store switch like the rest of the promotion.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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
  assert.deepEqual(entries(siteNav(LISTING, VERSION)).map((item) => item.text), ['Free tools', 'Browser extension', 'Developers', 'About'])
})

test('switch off: no extension entry anywhere in the nav', () => {
  const nav = siteNav(null, VERSION)
  assert.deepEqual(entries(nav).map((item) => item.text), ['Free tools', 'Developers', 'About'])
  assert.deepEqual(hrefs(nav).filter((link) => link.startsWith('/extension/')), [])
})

test('switch on: the extension page and its privacy page are both linked', () => {
  const nav = siteNav(LISTING, VERSION)
  assert.deepEqual(entries(nav)[1], { text: 'Browser extension', link: '/extension/', activeMatch: '^/extension/$' })
  assert.deepEqual(links(menu(nav, 'About').items ?? []).find(([, link]) => link === '/extension/privacy'), ['Extension privacy', '/extension/privacy'])
})

test('Free tools keeps its seven tools, in order', () => {
  assert.deepEqual(links(menu(siteNav(LISTING, VERSION), 'Free tools').items ?? []), [
    ['BPM Analyzer', '/'],
    ['Tap Tempo', '/tap-tempo'],
    ['BPM to ms Calculator', '/bpm-to-ms'],
    ['Video BPM Finder', '/video-bpm'],
    ['BPM to Frames Calculator', '/bpm-to-frames'],
    ['Metronome', '/metronome'],
    ['Strobe Light', '/strobe-light'],
  ])
})

test('Developers holds the library, its CLI and MCP server, the v6 migration, and the changelog under the version', () => {
  const developers = menu(siteNav(null, VERSION), 'Developers')
  assert.deepEqual(links(developers.items ?? []), [
    ['Library guide', '/guide/getting-started'],
    ['Examples', '/examples/basic-usage'],
    ['API reference', '/api/'],
    ['CLI', '/guide/cli'],
    ['MCP server', '/guide/mcp'],
    ['Migrating to v6', '/guide/migration-v6'],
    ['Changelog', CHANGELOG],
  ])
  const version = (developers.items ?? []).find((item) => item.items !== undefined)
  assert.equal(version?.text, 'v5.6.1', 'the version heads the changelog section')
  assert.equal(menu(siteNav(null, '6.0.0'), 'Developers').items?.find((item) => item.items)?.text, 'v6.0.0', 'the version is read, not written in')
})

const OUTSIDE_THE_LIBRARY = ['/', '/tap-tempo', '/extension/', '/extension/privacy', '/privacy', '/website-privacy', '/contributing', '/guides']

test('Developers highlights on every library page and nowhere else', () => {
  const { activeMatch } = menu(siteNav(LISTING, VERSION), 'Developers')
  // The CLI and MCP guides are library pages too, so they light it up on purpose.
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
    ['Code of conduct', '/code-of-conduct'],
  ])
  assert.deepEqual(links(menu(siteNav(null, VERSION), 'About').items ?? []).map(([text]) => text), ['Website privacy', 'Library privacy', 'Security', 'Contributing', 'Code of conduct'])
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

// RBA-240's DECISION of 2026-11-16: the CLI and the MCP server get a generic icon each, and the
// MCP server is named in text. No third-party logo: no terms allow the MCP one.
test('the CLI and MCP entries carry a generic icon, drawn by the theme, in both nav renderings', () => {
  const css = readFileSync(new URL('../.vitepress/theme/custom.css', import.meta.url), 'utf8')
  for (const link of ['/guide/cli', '/guide/mcp']) {
    for (const renderer of ['.VPMenuLink', '.VPNavScreenMenuGroupLink']) {
      assert.ok(css.includes(`${renderer} a[href="${link}"]::before`) || css.includes(`${renderer}[href="${link}"]::before`),
        `${link}: no icon in ${renderer}`)
    }
  }
  assert.ok(!/url\((?!["']?data:image\/svg\+xml)/.test(css), 'an icon must be inline SVG, not a fetched logo')
})
