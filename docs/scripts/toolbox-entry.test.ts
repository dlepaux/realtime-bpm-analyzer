// Run with `npm test`. The "Open the toolbox" entry from www into the musician app (RBA-284): each
// page that has one opens the app's copy of that page, the link carries nothing but the address,
// and the click event says where the entry sits and nothing else.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EVENTS, PARAMS } from '../.vitepress/tools/analytics-events.ts'
import { gateEvent } from '../.vitepress/tools/analytics-gate.ts'
import { freeTools } from '../.vitepress/tools/tool-list.ts'
import { APP_ORIGIN, APP_PLACEMENTS, appRouteOf, appUrlOf } from '../.vitepress/tools/toolbox-entry.ts'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

// The app's own list of the www pages it mirrors, path for path: rba-web's app/lib/www-pages.json
// (at 43ff059), copied as a fixture because that repo is private. The app's build refuses a
// canonical outside that list, so an entry pointing anywhere else would open a page the app lacks.
const APP_PAGES: readonly string[] = JSON.parse(read('./fixtures/app-www-pages.json'))

const ENTRY_PAGES = ['/', ...freeTools().map((tool) => tool.link)]

test('the home and every free tool open the same path in the app', () => {
  assert.equal(appRouteOf('/'), '/')
  for (const tool of freeTools()) assert.equal(appRouteOf(tool.link), tool.link, tool.name)
})

test('every entry points to a page the app has', () => {
  for (const page of ENTRY_PAGES) {
    const route = appRouteOf(page)
    assert.ok(route !== null && APP_PAGES.includes(route), `${page} opens ${route}, which the app doesn't list`)
  }
})

test('the .html and index forms of a path are the same page', () => {
  assert.equal(appRouteOf('/index.html'), '/')
  assert.equal(appRouteOf('/index'), '/')
  assert.equal(appRouteOf(''), '/')
  assert.equal(appRouteOf('/metronome.html'), '/metronome')
})

test('a tool path with a trailing slash, a 404 on www, has no entry', () => {
  // The 404 page is prerendered without one, so an entry here would not match on hydration.
  assert.equal(appRouteOf('/metronome/'), null)
  assert.equal(appRouteOf('/video-bpm/'), null)
})

test('pages the app doesn\'t mirror have no entry', () => {
  for (const path of ['/guide/getting-started', '/api/', '/extension/', '/website-privacy', '/metronome/extra', '/metronome/', '/404']) {
    assert.equal(appRouteOf(path), null, path)
    assert.equal(appUrlOf(path), null, path)
  }
})

test('the link is the app\'s address alone: no UTM, no query, no fragment', () => {
  // www and the app share one GA4 property and cookie: a UTM tag would re-credit the app visit.
  assert.equal(APP_ORIGIN, 'https://app.realtime-bpm-analyzer.com')
  for (const page of ENTRY_PAGES) {
    const href = appUrlOf(page)
    assert.ok(href, page)
    const url = new URL(href)
    assert.equal(url.origin, APP_ORIGIN)
    assert.equal(url.search, '', href)
    assert.equal(url.hash, '', href)
  }
})

test('the home and every tool page render the entry below the tool', () => {
  assert.match(read('../.vitepress/components/HomeHero.vue'), /<ToolboxEntry\s+placement="app_below_tool"/)
  for (const tool of freeTools()) {
    assert.match(read(`..${tool.link}.md`), /<ToolboxEntry placement="app_below_tool" \/>/, `${tool.link}.md`)
  }
})

test('the click event carries its placement and nothing else', () => {
  assert.deepEqual(EVENTS.app_link_clicked.params, { placement: 'required' })
  for (const placement of APP_PLACEMENTS) {
    assert.ok((PARAMS.placement.values as readonly string[]).includes(placement), placement)
    assert.deepEqual(gateEvent('app_link_clicked', { placement }), { params: { placement }, problems: [] })
  }
  // An address is never part of it: the gate drops a param the catalogue doesn't declare.
  const gated = gateEvent('app_link_clicked', { placement: 'app_nav', url: 'https://app.realtime-bpm-analyzer.com/metronome' })
  assert.deepEqual(gated.params, { placement: 'app_nav' })
  assert.equal(gated.problems.length, 1)
})
