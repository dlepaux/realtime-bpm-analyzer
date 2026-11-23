// The blocked microphone's help and the phone's note before a pasted link reaches the mic, in a
// real Chrome. The mic is denied through Chrome's own permission control, as a
// visitor's "Block" leaves it, and each browser is played by its user agent (and, for a phone,
// its client hints, which decide whether tab audio is offered).
//
// The built site is served under its production hostname from a local server, as in
// analytics-contract.e2e.ts, so the analytics code runs as it does live and the error event can
// be read off the page's dataLayer. Every request to Google is aborted, gtag.js included: nothing
// is ever sent.
//
// Run against a local site, dev or built (`vitepress preview`):
//     MIC_E2E_BASE_URL=http://localhost:4173 npm run test:mic-denied -w docs

import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import puppeteer, { type Browser, type HTTPRequest, type Page } from 'puppeteer'
import { MIC_ALLOW_STEPS, MIC_BLOCKED_LINE, PHONE_LINK_LINE } from '../.vitepress/tools/mic-denied-help.ts'
import { PRODUCTION_HOST, SITE_URL } from '../.vitepress/tools/site-url.ts'

const BASE_URL = process.env.MIC_E2E_BASE_URL
const TIMEOUT_MS = 30_000
const ORIGIN = new URL(SITE_URL).origin

const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36'
const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1'
const MAC_FIREFOX = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:145.0) Gecko/20100101 Firefox/145.0'

type Device = { readonly userAgent?: string; readonly phone: boolean }

let browser: Browser

async function serveLocally(request: HTTPRequest): Promise<void> {
  const { pathname, search } = new URL(request.url())
  const response = await fetch(`${BASE_URL}${pathname}${search}`, { redirect: 'manual' })
  const headers = Object.fromEntries([...response.headers].filter(([name]) =>
    !['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(name)))
  await request.respond({ status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) })
}

function route(request: HTTPRequest): Promise<void> {
  const url = new URL(request.url())
  if (url.hostname === PRODUCTION_HOST) return serveLocally(request).catch(() => request.abort())
  if (url.protocol === 'data:' || url.protocol === 'blob:') return request.continue()
  // Google's tag and collect hosts above all, and anything else outside the site.
  return request.abort()
}

async function openPage(device: Device): Promise<Page> {
  const page = await browser.newPage()
  page.setDefaultTimeout(TIMEOUT_MS)
  await page.setRequestInterception(true)
  page.on('request', (request) => void route(request))
  if (device.phone) {
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
    await page.setUserAgent({
      userAgent: device.userAgent ?? ANDROID_CHROME,
      userAgentMetadata: { brands: [{ brand: 'Chromium', version: '142' }], mobile: true, platform: 'Android', platformVersion: '10', architecture: '', model: 'K' },
    })
  } else {
    await page.setViewport({ width: 1440, height: 900 })
    if (device.userAgent) await page.setUserAgent({ userAgent: device.userAgent })
  }
  await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle0' })
  return page
}

async function pickSource(page: Page, label: string): Promise<void> {
  await page.locator(`.bpm-source-btn ::-p-text(${label})`).click()
}

async function denyMic(page: Page): Promise<string> {
  await pickSource(page, 'Mic')
  await page.locator('button[aria-label="Detect BPM from microphone"]').click()
  const alert = await page.waitForSelector('.bpm-mode-mic .bpm-state-error')
  return alert!.evaluate((node) => (node as HTMLElement).innerText)
}

before(async () => {
  assert.ok(BASE_URL, 'Set MIC_E2E_BASE_URL to a running local site, such as http://localhost:4173')
  browser = await puppeteer.launch({
    args: ['--use-fake-device-for-media-stream', '--mute-audio'],
  })
  await browser.defaultBrowserContext().setPermission(ORIGIN, { permission: { name: 'microphone' }, state: 'denied' })
})

after(async () => {
  await browser?.close()
})

const DENIED_CASES: readonly (readonly [string, Device, string])[] = [
  ['Chrome on Android', { userAgent: ANDROID_CHROME, phone: true }, MIC_ALLOW_STEPS.android_chrome],
  ['Safari on iPhone', { userAgent: IPHONE_SAFARI, phone: true }, MIC_ALLOW_STEPS.ios_safari],
  ['Chrome on desktop', { phone: false }, MIC_ALLOW_STEPS.chrome],
  ['Firefox on desktop', { userAgent: MAC_FIREFOX, phone: false }, MIC_ALLOW_STEPS.firefox],
]

for (const [name, device, steps] of DENIED_CASES) {
  test(`a blocked mic in ${name} says how to allow it, and offers the file and tapping`, async () => {
    const page = await openPage(device)
    const text = await denyMic(page)
    assert.match(text, new RegExp(MIC_BLOCKED_LINE.replace(/[.]/g, '\\.')))
    assert.ok(text.includes(steps), text)
    assert.match(text, /choose a file/)
    assert.equal(await page.$eval('.bpm-mode-mic a[href="/tap-tempo"]', (a) => a.textContent?.trim()), 'tap the tempo')

    // The existing error event, with its kind and the browser's name for the refusal.
    const errors = await page.evaluate(() => ((window as unknown as { dataLayer?: unknown[] }).dataLayer ?? [])
      .map((entry) => Array.from(entry as ArrayLike<unknown>))
      .filter((entry) => entry[0] === 'event' && entry[1] === 'bpm_mic_error')
      .map((entry) => entry[2]))
    assert.equal(errors.length, 1, JSON.stringify(errors))
    assert.deepEqual(
      { kind: (errors[0] as Record<string, unknown>).error_kind, name: (errors[0] as Record<string, unknown>).error_name },
      { kind: 'denied', name: 'NotAllowedError' },
    )
    assert.equal(typeof (errors[0] as Record<string, unknown>).reason, 'string')

    // Choosing a file leaves the mic for the file picker.
    const chooser = page.waitForFileChooser()
    await page.locator('.bpm-mode-mic .bpm-text-btn ::-p-text(choose a file)').click()
    await chooser
    await page.close()
  })
}

test('a pasted link on a phone says the song must play out loud, and offers the file', async () => {
  const page = await openPage({ phone: true })
  await pickSource(page, 'Stream')
  await page.locator('#bpm-stream-url').fill('https://www.youtube.com/watch?v=abc')
  const hint = await page.waitForSelector(`.bpm-stream-hint ::-p-text(${PHONE_LINK_LINE})`)
  assert.ok(hint)
  const chooser = page.waitForFileChooser()
  await page.locator('.bpm-mode-stream .bpm-text-btn ::-p-text(choose a file)').click()
  await chooser
  await page.close()
})

// Firefox has no tab audio, so this is the branch the phone line lives in, on a desktop.
test('a pasted link on a desktop without tab audio keeps its own hint, without the phone line', async () => {
  const page = await openPage({ userAgent: MAC_FIREFOX, phone: false })
  await pickSource(page, 'Stream')
  await page.locator('#bpm-stream-url').fill('https://www.youtube.com/watch?v=abc')
  await page.waitForSelector('.bpm-link-note')
  const text = await page.$eval('.bpm-mode-stream', (node) => (node as HTMLElement).innerText)
  assert.ok(text.includes('Play the track out loud on any device and hold it near this one.'), text)
  assert.ok(!text.includes(PHONE_LINK_LINE), text)
  await page.close()
})
