// Run with `npm test`. Where Google Analytics loads (RBA-154): the production host only, so local
// runs and preview hosts never report, and the owner's devices are marked internal.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { GA_MEASUREMENT_ID, GTAG_SRC, INTERNAL_FLAG_KEY, gaLoaderScript } from '../.vitepress/tools/analytics-loader.ts'
import { PRODUCTION_HOST, SITE_URL } from '../.vitepress/tools/site-url.ts'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

type Page = { appended: { src: string; async: boolean }[]; dataLayer?: ArrayLike<unknown>[]; gtag?: unknown }

function runLoader(hostname: string, storage: Record<string, string> | 'throws' = {}): Page {
  const appended: Page['appended'] = []
  const window: Record<string, unknown> = {}
  const context = {
    window,
    location: { hostname },
    localStorage: {
      getItem: (key: string) => {
        if (storage === 'throws') throw new Error('SecurityError')
        return storage[key] ?? null
      },
    },
    document: {
      createElement: () => ({ src: '', async: false }),
      head: { appendChild: (element: { src: string; async: boolean }) => appended.push(element) },
    },
    Date,
  }
  runInNewContext(gaLoaderScript(), context)
  return { appended, dataLayer: window.dataLayer as Page['dataLayer'], gtag: window.gtag }
}

// The loader runs in its own realm: JSON brings its objects back as plain ones of this realm.
const calls = (page: Page): unknown[][] => JSON.parse(JSON.stringify((page.dataLayer ?? []).map((args) => Array.from(args))))

test('the production host is the site config\'s, with no second literal', () => {
  assert.equal(PRODUCTION_HOST, new URL(SITE_URL).hostname)
  assert.doesNotMatch(read('../.vitepress/tools/analytics-loader.ts'), /realtime-bpm-analyzer\.com/)
  const config = read('../.vitepress/config.ts')
  assert.match(config, /gaLoaderScript\(\)/)
  assert.doesNotMatch(config, /'https:\/\/www\.realtime-bpm-analyzer\.com/)
})

test('on the production host: gtag.js loads once and gtag is configured with the ID', () => {
  const page = runLoader(PRODUCTION_HOST)
  assert.deepEqual(JSON.parse(JSON.stringify(page.appended)), [{ src: GTAG_SRC, async: true }])
  assert.equal(typeof page.gtag, 'function')
  const [js, config] = calls(page)
  assert.equal(js?.[0], 'js')
  assert.equal(calls(page).length, 2, 'the loader itself sends no event and no page_view of its own')
  assert.deepEqual(config, ['config', GA_MEASUREMENT_ID, {}])
})

test('anywhere else nothing loads and gtag is never defined', () => {
  for (const host of ['localhost', '127.0.0.1', 'example.github.io', 'realtime-bpm-analyzer.com', `preview.${PRODUCTION_HOST}`, '']) {
    const page = runLoader(host)
    assert.deepEqual(page.appended, [], host)
    assert.equal(page.gtag, undefined, host)
    assert.equal(page.dataLayer, undefined, host)
  }
})

test('the internal flag marks the visit as internal traffic, and only "1" does', () => {
  assert.deepEqual(calls(runLoader(PRODUCTION_HOST, { [INTERNAL_FLAG_KEY]: '1' }))[1], ['config', GA_MEASUREMENT_ID, { traffic_type: 'internal' }])
  assert.deepEqual(calls(runLoader(PRODUCTION_HOST, { [INTERNAL_FLAG_KEY]: 'true' }))[1], ['config', GA_MEASUREMENT_ID, {}])
})

test('blocked storage still loads analytics, as external traffic', () => {
  const page = runLoader(PRODUCTION_HOST, 'throws')
  assert.equal(page.appended.length, 1)
  assert.deepEqual(calls(page)[1], ['config', GA_MEASUREMENT_ID, {}])
})

test('no tag manager is left in the site config', () => {
  const config = read('../.vitepress/config.ts')
  assert.doesNotMatch(config, /GTM-|gtm\.js|ns\.html/)
})
