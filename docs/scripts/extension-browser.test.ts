// Run with `npm test`. Which browser a visitor is in, and what the install block offers them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { TOUCH_QUERY, detectBrowser, installOffer, readSignals, type VisitorBrowser } from '../.vitepress/tools/extension-browser.ts'
import { installTargets, storeLink } from '../.vitepress/tools/extension-promo.ts'

const LISTING = `https://chromewebstore.google.com/detail/live-bpm-detector/${'a'.repeat(32)}`
const EDGE_LISTING = `https://microsoftedge.microsoft.com/addons/detail/${'c'.repeat(32)}`

const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
const CHROME_UA = `${MAC} AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36`
const UA = {
  chrome: CHROME_UA,
  edge: `${CHROME_UA} Edg/150.0.0.0`,
  opera: `${CHROME_UA} OPR/120.0.0.0`,
  vivaldi: `${CHROME_UA} Vivaldi/7.5`,
  firefox: `${MAC.replace('10_15_7', '10.15')}; rv:140.0) Gecko/20100101 Firefox/140.0`,
  safari: `${MAC} AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15`,
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1',
}
const brands = (...own: string[]) => ['Not)A;Brand', 'Chromium', ...own]
const desktop = (userAgent: string, list: readonly string[] | null = null) => ({ brands: list, userAgent, touch: false })

test('detectBrowser reads the brands first, where Chromium browsers name themselves', () => {
  assert.equal(detectBrowser(desktop(UA.chrome, brands('Google Chrome'))), 'chrome')
  assert.equal(detectBrowser(desktop(UA.edge, brands('Microsoft Edge'))), 'edge')
  assert.equal(detectBrowser(desktop(UA.chrome, brands('Brave'))), 'other-chromium', 'Brave sends Chrome\'s user agent, but its own brand')
  assert.equal(detectBrowser(desktop(UA.opera, brands('Opera'))), 'other-chromium')
  assert.equal(detectBrowser(desktop(UA.chrome, brands())), 'other-chromium', 'Chromium alone is not Chrome')
})

test('detectBrowser falls back to the user agent string when there are no brands', () => {
  assert.equal(detectBrowser(desktop(UA.chrome)), 'chrome')
  assert.equal(detectBrowser(desktop(UA.chrome, [])), 'chrome', 'an empty list is no answer')
  assert.equal(detectBrowser(desktop(UA.edge)), 'edge')
  assert.equal(detectBrowser(desktop(UA.opera)), 'other-chromium')
  assert.equal(detectBrowser(desktop(UA.vivaldi)), 'other-chromium')
  assert.equal(detectBrowser(desktop(UA.firefox)), 'firefox')
  assert.equal(detectBrowser(desktop(UA.safari)), 'safari')
  assert.equal(detectBrowser(desktop('')), 'unknown')
  assert.equal(detectBrowser(desktop('curl/8.0')), 'unknown')
})

test('detectBrowser: a touch device is touch whatever the browser, because none of them installs it', () => {
  assert.equal(detectBrowser({ brands: brands('Google Chrome'), userAgent: UA.chrome, touch: true }), 'touch')
  assert.equal(detectBrowser({ brands: null, userAgent: UA.iphone, touch: true }), 'touch')
})

const both = installTargets(LISTING, EDGE_LISTING, 'extension_hero')
const view = (browser: VisitorBrowser, targets = both) => {
  const offer = installOffer(targets, browser)
  return { buttons: offer.buttons.map((b) => [b.id, b.primary, b.title, b.subtitle]), context: offer.context }
}

test('installOffer: the neutral offer is Chrome then Edge, the order the server renders', () => {
  const neutral = view('unknown')
  assert.deepEqual(neutral.buttons, [
    ['chrome', true, 'Add to Chrome', 'Chrome Web Store'],
    ['edge', false, 'Add to Edge', 'Edge Add-ons'],
  ])
  assert.equal(neutral.context, null)
  for (const browser of ['chrome', 'touch'] as const) assert.deepEqual(view(browser), neutral, browser)
})

test('installOffer: where neither store installs, no button is filled, so none looks like the way in', () => {
  for (const browser of ['firefox', 'safari'] as const) {
    assert.deepEqual(view(browser).buttons, view('unknown').buttons.map(([id, , title, subtitle]) => [id, false, title, subtitle]), browser)
  }
  assert.equal(view('safari').context, 'Works in Chrome and Edge on a computer.', 'says why nothing is filled')
})

test('installOffer: Edge leads in Edge, with Chrome second', () => {
  assert.deepEqual(view('edge').buttons, [
    ['edge', true, 'Add to Edge', 'Edge Add-ons'],
    ['chrome', false, 'Add to Chrome', 'Chrome Web Store'],
  ])
})

test('installOffer: another Chromium browser gets the Chrome Web Store, without being named', () => {
  const offer = view('other-chromium')
  assert.deepEqual(offer.buttons[0], ['chrome', true, 'Install it free', 'from the Chrome Web Store'])
  assert.deepEqual(offer.buttons[1], ['edge', false, 'Add to Edge', 'Edge Add-ons'])
  assert.equal(offer.context, null)
})

test('installOffer: Firefox keeps both stores and gets one honest line, with no date', () => {
  const offer = view('firefox')
  assert.equal(offer.context, 'A Firefox version is on its way.')
  assert.doesNotMatch(offer.context ?? '', /\d/)
})

test('installOffer keeps every link and its label: only the order, the emphasis and the words change', () => {
  for (const browser of ['chrome', 'edge', 'firefox', 'other-chromium', 'safari', 'touch', 'unknown'] as const) {
    const offer = installOffer(both, browser)
    const filled = browser === 'firefox' || browser === 'safari' ? 0 : 1
    assert.equal(offer.buttons.filter((b) => b.primary).length, filled, browser)
    assert.deepEqual(offer.buttons.map((b) => b.href).sort(), [storeLink(EDGE_LISTING, 'extension_hero'), storeLink(LISTING, 'extension_hero')].sort(), browser)
  }
})

test('installOffer without an Edge listing offers Chrome to everyone, Edge included', () => {
  const chromeOnly = installTargets(LISTING, null, 'extension_hero')
  assert.deepEqual(installOffer(chromeOnly, 'edge').buttons.map((b) => [b.id, b.primary]), [['chrome', true]])
  assert.deepEqual(installOffer([], 'chrome').buttons, [])
})

test('readSignals takes the brand names where the browser has them, and nothing else', () => {
  const brave = { userAgent: UA.chrome, userAgentData: { brands: brands('Brave').map((brand) => ({ brand, version: '150' })), mobile: false } }
  assert.deepEqual(readSignals(brave, false), { brands: brands('Brave'), userAgent: UA.chrome, touch: false })
  assert.deepEqual(readSignals({ userAgent: UA.firefox }, false), { brands: null, userAgent: UA.firefox, touch: false })
})

test('the promotion has one device check: the pointer, coarse for touch, never hover or a phone width', () => {
  assert.equal(TOUCH_QUERY, '(pointer: coarse)')
  const theme = new URL('../.vitepress/theme/', import.meta.url)
  const sheets = readdirSync(theme).filter((name) => name.startsWith('extension') && name.endsWith('.css'))
  assert.ok(sheets.length >= 3)
  for (const name of sheets) {
    const css = readFileSync(new URL(name, theme), 'utf8')
    for (const [, query = ''] of css.matchAll(/@media([^{]+)\{/g)) {
      assert.doesNotMatch(query, /hover/, `${name}: ${query}`)
      for (const [feature] of query.matchAll(/\(pointer:[^)]*\)/g)) assert.match(feature, /^\(pointer: (?:coarse|fine)\)$/, `${name}: ${query}`)
    }
  }
})
