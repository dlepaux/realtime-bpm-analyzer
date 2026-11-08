// The analytics contract in a real browser (RBA-154): what gtag.js actually sends, read off the
// wire. Unit tests prove the catalogue and the gate; only this proves that a hit carries exactly
// an event's own params (no stale values from the event before, the GTM failure) and that each
// page sends exactly one page_view.
//
// It never sends a real hit. Every request to Google's collect endpoints is captured and aborted,
// every other outside request is aborted, the only one let through is the gtag.js script itself,
// and the browser resolves Google Analytics' hosts to this machine besides, so a request the
// interception missed still goes nowhere. The site is served under its production hostname (the
// only one analytics loads on) from a local server, by answering those requests in the test.
//
// gtag.js comes from Google with the data stream's live settings, so the page_view counts hold
// only while the stream's enhanced measurement "page changes based on browser history events" is
// off, as the site requires (tools/analytics-loader.ts). If it is turned back on, this test fails.
//
// Run against a local site, dev or built (`vitepress preview`):
//     CONTRACT_BASE_URL=http://localhost:5189 npm run test:analytics-contract -w docs
// Puppeteer is a docs dev dependency (the library's browser tests use the same version); Chrome is
// launched muted.

import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import puppeteer, { type Browser, type HTTPRequest, type Page } from 'puppeteer'
import { EVENTS, type EventSpec } from '../.vitepress/tools/analytics-events.ts'
import { GTAG_SRC } from '../.vitepress/tools/analytics-loader.ts'
import { PRODUCTION_HOST, SITE_URL } from '../.vitepress/tools/site-url.ts'

const BASE_URL = process.env.CONTRACT_BASE_URL
const NAVIGATION_TIMEOUT_MS = 90_000
// gtag.js batches events for a moment before it sends; this is well past that.
const HIT_TIMEOUT_MS = 15_000
// Once the expected hits arrived, how long to wait to be sure no extra one follows.
const QUIET_MS = 3_000

const GOOGLE_HOSTS = ['*.google-analytics.com', '*.analytics.google.com', '*.doubleclick.net', 'www.google.com']
const COLLECT = /google-analytics\.com|analytics\.google\.com|doubleclick\.net|\/g\/collect|\/collect\?/

type Hit = { readonly name: string; readonly location: string; readonly title: string; readonly referrer: string; readonly trafficType: string; readonly params: Readonly<Record<string, string>> }

const hits: Hit[] = []
const blocked: string[] = []
const pageErrors: string[] = []
let browser: Browser
let page: Page

/** The events in one GA4 request: shared params in the URL, one line per event in the body. */
function parseHits(url: string, body: string | undefined): Hit[] {
  const shared = new URL(url).searchParams
  const lines = body ? body.split('\n').filter(Boolean) : ['']
  return lines.map((line) => {
    const all = new URLSearchParams(shared)
    for (const [key, value] of new URLSearchParams(line)) all.set(key, value)
    const params: Record<string, string> = {}
    for (const [key, value] of all) {
      const match = /^epn?\.(.+)$/.exec(key)
      if (match?.[1]) params[match[1]] = value
    }
    return { name: all.get('en') ?? '', location: all.get('dl') ?? '', title: all.get('dt') ?? '', referrer: all.get('dr') ?? '', trafficType: all.get('tt') ?? '', params }
  })
}

/** Serves a production-host request from the local site, so the page believes it is live. */
async function serveLocally(request: HTTPRequest): Promise<void> {
  const { pathname, search } = new URL(request.url())
  const response = await fetch(`${BASE_URL}${pathname}${search}`, { redirect: 'manual' })
  const headers = Object.fromEntries([...response.headers].filter(([name]) =>
    !['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(name)))
  await request.respond({ status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) })
}

async function route(request: HTTPRequest): Promise<void> {
  const url = request.url()
  if (new URL(url).hostname === PRODUCTION_HOST) return serveLocally(request).catch(() => request.abort())
  if (url.startsWith(GTAG_SRC)) return request.continue()
  // A beacon's body can be missing from postData(); fetchPostData() reads it back from the browser.
  if (COLLECT.test(url)) hits.push(...parseHits(url, request.postData() ?? (await request.fetchPostData().catch(() => undefined))))
  else blocked.push(url)
  return request.abort()
}

const pageViews = () => hits.filter((hit) => hit.name === 'page_view')
const eventsNamed = (name: string) => hits.filter((hit) => hit.name === name)

async function waitFor(what: string, done: () => boolean): Promise<void> {
  const until = Date.now() + HIT_TIMEOUT_MS
  while (!done()) {
    if (Date.now() > until) assert.fail(`timed out waiting for ${what}; hits: ${JSON.stringify(hits)}; blocked: ${blocked.join(' ')}`)
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  await new Promise((resolve) => setTimeout(resolve, QUIET_MS))
}

before(async () => {
  assert.ok(BASE_URL, 'Set CONTRACT_BASE_URL to the local site, for example http://localhost:5189')
  const rules = [PRODUCTION_HOST, ...GOOGLE_HOSTS].map((host) => `MAP ${host} 127.0.0.1`).join(', ')
  // GitHub's Ubuntu runners have no usable Chrome sandbox, as the library's browser tests found.
  const sandbox = process.env.CI ? ['--no-sandbox', '--disable-setuid-sandbox'] : []
  browser = await puppeteer.launch({ headless: true, args: ['--mute-audio', `--host-resolver-rules=${rules}`, ...sandbox] })
  page = await (await browser.createBrowserContext()).newPage()
  page.setDefaultTimeout(NAVIGATION_TIMEOUT_MS)
  page.on('pageerror', (error) => pageErrors.push(String(error)))
  await page.setRequestInterception(true)
  page.on('request', (request) => void route(request))
})

after(async () => {
  await browser?.close()
})

test('one page_view on load', async () => {
  await page.goto(`${SITE_URL}/`, { waitUntil: 'load', timeout: NAVIGATION_TIMEOUT_MS })
  await page.waitForSelector('.bpm-source-btn')
  await waitFor('the first page_view', () => pageViews().length >= 1)
  assert.equal(pageViews().length, 1, JSON.stringify(pageViews()))
})

test('a hit carries exactly its own params, and none from the event before', async () => {
  const buttons = await page.$$('.bpm-source-btn')
  await buttons[2]?.click()
  await waitFor('bpm_tab_change', () => eventsNamed('bpm_tab_change').length >= 1)
  assert.deepEqual(eventsNamed('bpm_tab_change').map((hit) => hit.params), [{ mode: 'stream' }])

  await page.type('#bpm-stream-url', 'https://www.youtube.com/watch?v=abc')
  await waitFor('bpm_link_detected', () => eventsNamed('bpm_link_detected').length >= 1)
  // `mode` was set by the event before: under GTM it rode along on this one too.
  assert.deepEqual(eventsNamed('bpm_link_detected').map((hit) => hit.params), [{ platform: 'youtube' }])
})

test('an in-site navigation sends its event and exactly one more page_view', async () => {
  await page.click('.home-tool-tile[href="/tap-tempo"]')
  await waitFor('the tool page_view', () => pageViews().length >= 2)
  assert.deepEqual(eventsNamed('bpm_home_tool_clicked').map((hit) => hit.params), [{ tool: 'tap-tempo' }])
  assert.equal(pageViews().length, 2, JSON.stringify(pageViews()))
  assert.match(pageViews()[1]!.location, /\/tap-tempo$/)
  // The router changes the address before it renders the page: the hit must still carry the new title.
  assert.match(pageViews()[1]!.title, /^Tap Tempo/)
  // Its referrer is the page left, not the outside referrer of the landing page.
  assert.equal(pageViews()[1]!.referrer, pageViews()[0]!.location)

  await page.goBack()
  await waitFor('the page_view of the way back', () => pageViews().length >= 3)
  assert.equal(pageViews().length, 3, JSON.stringify(pageViews()))
  assert.match(pageViews()[2]!.referrer, /\/tap-tempo$/)
})

/** Loads a page fresh, then runs `act`, and returns how many page_views the whole visit sent. */
async function pageViewsOfVisit(path: string, act: () => Promise<void> = async () => {}): Promise<number> {
  const before = pageViews().length
  await page.goto(`${SITE_URL}${path}`, { waitUntil: 'load', timeout: NAVIGATION_TIMEOUT_MS })
  await waitFor(`the page_view of ${path}`, () => pageViews().length > before)
  await act()
  await new Promise((resolve) => setTimeout(resolve, QUIET_MS))
  return pageViews().length - before
}

// The other ways VitePress and the tools rewrite the address without a new page (review of #362).
test('a tempo written into the address is not a page_view', async () => {
  const count = await pageViewsOfVisit('/bpm-to-frames', async () => {
    await page.waitForSelector('.bpm-input')
    await page.click('.bpm-input', { count: 3 })
    await page.type('.bpm-input', '128')
    await page.waitForFunction(() => location.search.includes('bpm=128'))
  })
  assert.equal(count, 1, JSON.stringify(pageViews().slice(-3)))
})

test('a jump to a heading on the same page is not a page_view', async () => {
  const count = await pageViewsOfVisit('/guide/getting-started', async () => {
    await page.click('a.header-anchor')
    await page.waitForFunction(() => location.hash.length > 1)
  })
  assert.equal(count, 1, JSON.stringify(pageViews().slice(-3)))
})

test('an old .html address is one page_view, under its clean address', async () => {
  const count = await pageViewsOfVisit('/tap-tempo.html')
  assert.equal(count, 1, JSON.stringify(pageViews().slice(-3)))
})

// The GA4 internal traffic filter drops the hits that carry traffic_type=internal, so the owner's
// flag has to reach the wire, and every other visit has to go out unmarked.
test('a visit is unmarked, and a flagged browser marks every hit internal', async () => {
  assert.deepEqual(hits.filter((hit) => hit.trafficType !== ''), [], 'an unflagged visit went out marked')
  await page.evaluate(() => localStorage.setItem('rba:internal', '1'))
  try {
    const before = hits.length
    await pageViewsOfVisit('/tap-tempo')
    // Leaving the page before sends its user_engagement, unmarked: it belongs to the visit before.
    const flagged = hits.slice(before).filter((hit) => hit.location.endsWith('/tap-tempo'))
    assert.ok(flagged.length > 0)
    assert.deepEqual(flagged.filter((hit) => hit.trafficType !== 'internal'), [], JSON.stringify(flagged))
  } finally {
    await page.evaluate(() => localStorage.removeItem('rba:internal'))
  }
})

// What GA4 and its enhanced measurement send by themselves, with params of their own.
const COLLECTED_BY_GA = new Set(['page_view', 'user_engagement', 'scroll', 'click', 'file_download', 'form_start', 'form_submit', 'view_search_results'])

test('every event sent is in the catalogue, with declared params only, and nothing broke the page', () => {
  const ours = new Set(Object.values(EVENTS as Record<string, EventSpec>).flatMap((spec) => Object.keys(spec.params)))
  for (const hit of hits) {
    if (COLLECTED_BY_GA.has(hit.name)) {
      // A stale value would show here too: none of the site's params belongs on GA's own events.
      for (const key of Object.keys(hit.params)) assert.ok(!ours.has(key), `${hit.name} carries ${key}`)
      continue
    }
    const spec = (EVENTS as Record<string, EventSpec>)[hit.name]
    assert.ok(spec, `${hit.name} is not in the catalogue`)
    for (const key of Object.keys(hit.params)) assert.ok(Object.hasOwn(spec.params, key), `${hit.name}.${key} is not declared`)
  }
  assert.deepEqual(pageErrors, [])
})
