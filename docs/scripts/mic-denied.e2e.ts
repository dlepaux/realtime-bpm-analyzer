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
import puppeteer, { type Browser, type BrowserContext, type HTTPRequest, type Page } from 'puppeteer'
import { MIC_ALLOW_STEPS, MIC_BLOCKED_BEFORE_PRESS, MIC_BLOCKED_LINE, MIC_PURPOSE_LINE, PHONE_LINK_LINE } from '../.vitepress/tools/mic-denied-help.ts'
import { PRODUCTION_HOST, SITE_URL } from '../.vitepress/tools/site-url.ts'

const BASE_URL = process.env.MIC_E2E_BASE_URL
const TIMEOUT_MS = 30_000
const ORIGIN = new URL(SITE_URL).origin

const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36'
const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1'
const MAC_FIREFOX = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:145.0) Gecko/20100101 Firefox/145.0'

type Device = { readonly userAgent?: string; readonly phone: boolean; readonly context?: BrowserContext; readonly before?: () => void }

// Before any page script: every getUserMedia call is logged with the last press before it, so a
// test can prove the browser's prompt only ever follows a press to start listening.
function logMicRequests(): void {
  const log: string[] = []
  let lastPress = 'none'
  Object.assign(window, { __micRequests: log })
  for (const type of ['pointerdown', 'click', 'keydown']) {
    addEventListener(type, (event) => {
      if (event.isTrusted) lastPress = (event.target as HTMLElement).closest('button, a')?.textContent?.trim() || 'press'
    }, true)
  }
  const devices = navigator.mediaDevices
  const getUserMedia = devices.getUserMedia.bind(devices)
  devices.getUserMedia = (constraints) => {
    log.push(lastPress)
    return getUserMedia(constraints)
  }
}

function micRequests(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __micRequests: string[] }).__micRequests)
}

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
  const page = await (device.context ?? browser.defaultBrowserContext()).newPage()
  page.setDefaultTimeout(TIMEOUT_MS)
  await page.evaluateOnNewDocument(logMicRequests)
  if (device.before) await page.evaluateOnNewDocument(device.before)
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

// The site is blocked already, as a returning visitor's "Block" leaves it, and the Permissions API
// says so: the Mic tab shows the help in place of a button that could only fail, with no request
// and no Try again, since a retry would be refused unseen.
async function denyMic(page: Page): Promise<string> {
  await pickSource(page, 'Mic')
  const help = await page.waitForSelector('.bpm-mode-mic .bpm-state-error')
  assert.equal(await page.$('button[aria-label="Detect BPM from microphone"]'), null)
  assert.equal(await page.$('.bpm-mode-mic .bpm-restart-btn'), null)
  assert.deepEqual(await micRequests(page), [])
  return help!.evaluate((node) => (node as HTMLElement).innerText)
}

function micErrors(page: Page): Promise<Record<string, unknown>[]> {
  return page.evaluate(() => ((window as unknown as { dataLayer?: unknown[] }).dataLayer ?? [])
    .map((entry) => Array.from(entry as ArrayLike<unknown>))
    .filter((entry) => entry[0] === 'event' && entry[1] === 'bpm_mic_error')
    .map((entry) => entry[2] as Record<string, unknown>))
}

// iOS Safari opens a file picker only within the tap itself. The button is pressed from a script
// here, so no microtask checkpoint runs inside the press (a real tap runs one after each listener):
// the input's click() counts as within the tap only if it ran before the press returned, with no
// await, promise or timer in between. The picker itself is not opened.
async function pickerClicksWithinPress(page: Page, selector: string): Promise<string[]> {
  return page.$eval(selector, async (button) => {
    const calls: string[] = []
    let pressing = true
    const click = HTMLInputElement.prototype.click
    HTMLInputElement.prototype.click = function (this: HTMLInputElement) {
      if (this.type === 'file') calls.push(pressing ? 'within' : 'late')
    }
    ;(button as HTMLElement).click()
    pressing = false
    await new Promise((resolve) => setTimeout(resolve, 100))
    HTMLInputElement.prototype.click = click
    return calls
  })
}

before(async () => {
  assert.ok(BASE_URL, 'Set MIC_E2E_BASE_URL to a running local site, such as http://localhost:4173')
  // GitHub's Ubuntu runners have no usable Chrome sandbox, as in analytics-contract.e2e.ts.
  const sandbox = process.env.CI ? ['--no-sandbox', '--disable-setuid-sandbox'] : []
  browser = await puppeteer.launch({
    headless: true,
    args: ['--use-fake-device-for-media-stream', '--mute-audio', ...sandbox],
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

// Headless Chrome plays each browser by its user agent: this proves which steps each one is shown,
// not how that browser itself reports a block.
for (const [name, device, steps] of DENIED_CASES) {
  test(`a site blocked earlier, with ${name}'s user agent, shows how to allow the mic and offers the file and tapping, before any press`, async () => {
    const page = await openPage(device)
    const text = await denyMic(page)
    assert.ok(text.includes(MIC_BLOCKED_LINE), text)
    assert.ok(text.includes(steps), text)
    assert.match(text, /choose a file/)
    assert.equal(await page.$eval('.bpm-mode-mic a[href="/tap-tempo"]', (a) => a.textContent?.trim()), 'tap the tempo')
    // The denial is still counted, once per page view, with the reason that tells it from a press.
    assert.deepEqual(await micErrors(page), [MIC_BLOCKED_BEFORE_PRESS])
    await pickSource(page, 'File')
    await pickSource(page, 'Mic')
    await page.waitForSelector('.bpm-mode-mic .bpm-state-error')
    assert.deepEqual(await micErrors(page), [MIC_BLOCKED_BEFORE_PRESS])

    // Choosing a file leaves the mic for the file picker.
    const chooser = page.waitForFileChooser()
    await page.locator('.bpm-mode-mic .bpm-text-btn ::-p-text(choose a file)').click()
    await chooser
    await page.close()
  })
}

test('a pasted link on a blocked site goes to the help, never to a request', async () => {
  const page = await openPage({ phone: true })
  await pickSource(page, 'Stream')
  await page.locator('#bpm-stream-url').fill('https://www.youtube.com/watch?v=abc')
  await page.locator('.bpm-mode-stream ::-p-text(next to your mic)').click()
  const help = await page.waitForSelector('.bpm-mode-mic .bpm-state-error')
  assert.ok((await help!.evaluate((node) => (node as HTMLElement).innerText)).includes(MIC_ALLOW_STEPS.android_chrome))
  assert.deepEqual(await micRequests(page), [])
  assert.deepEqual(await micErrors(page), [MIC_BLOCKED_BEFORE_PRESS])
  await page.close()
})

test('choose a file opens the picker within the press, from the blocked mic and from a pasted link', async () => {
  const blocked = await openPage({ phone: true })
  await denyMic(blocked)
  assert.deepEqual(await pickerClicksWithinPress(blocked, '.bpm-mode-mic .bpm-text-btn'), ['within'])
  await blocked.close()

  const context = await browser.createBrowserContext()
  const link = await openPage({ phone: true, context })
  await pickSource(link, 'Stream')
  await link.locator('#bpm-stream-url').fill('https://www.youtube.com/watch?v=abc')
  await link.waitForSelector(`.bpm-stream-hint ::-p-text(${PHONE_LINK_LINE})`)
  assert.deepEqual(await pickerClicksWithinPress(link, '.bpm-mode-stream .bpm-stream-hint .bpm-text-btn'), ['within'])
  await context.close()
})

// Where the browser can't report the permission, the help waits for the refusal, which fires the
// existing error event with its reason, kind and name. Try again asks the browser again.
test('without the Permissions API, a refusal after the press shows the help, Try again and the error event', async () => {
  const page = await openPage({ phone: true, before: () => { Object.defineProperty(navigator, 'permissions', { value: undefined }) } })
  await pickSource(page, 'Mic')
  await page.locator('button[aria-label="Detect BPM from microphone"]').click()
  const help = await page.waitForSelector('.bpm-mode-mic .bpm-state-error')
  const text = await help!.evaluate((node) => (node as HTMLElement).innerText)
  assert.ok(text.includes(MIC_BLOCKED_LINE) && text.includes(MIC_ALLOW_STEPS.android_chrome), text)
  const errors = await micErrors(page)
  assert.equal(errors.length, 1, JSON.stringify(errors))
  assert.deepEqual({ kind: errors[0].error_kind, name: errors[0].error_name }, { kind: 'denied', name: 'NotAllowedError' })
  assert.equal(typeof errors[0].reason, 'string')
  await page.locator('.bpm-mode-mic ::-p-text(Try again)').click()
  await page.waitForFunction(() => (window as unknown as { __micRequests: string[] }).__micRequests.length === 2)
  assert.deepEqual(await micRequests(page), ['press', 'Try again'])
  await page.close()
})

// A first visit: the browser has not been asked yet, so the permission is "prompt".
for (const phone of [true, false]) {
  test(`on a first visit (${phone ? 'phone' : 'desktop'}), the mic is asked for only by a press, never by the page, the Mic tab or a pasted link`, async () => {
    const context = await browser.createBrowserContext()
    try {
      const page = await openPage({ phone, context })
      await pickSource(page, 'Mic')
      const idle = await page.$eval('.bpm-mode-mic', (node) => (node as HTMLElement).innerText)
      assert.ok(idle.includes(MIC_PURPOSE_LINE), idle)
      assert.deepEqual(await micRequests(page), [])
      await page.locator('button[aria-label="Detect BPM from microphone"]').click()
      await page.waitForFunction(() => (window as unknown as { __micRequests: string[] }).__micRequests.length > 0)
      // The mic button holds only its icon, so its press has no text of its own.
      assert.deepEqual(await micRequests(page), ['press'])
      await page.close()
    } finally {
      await context.close()
    }
    // Headless Chrome answers the first prompt with a refusal and may keep it for the context, so
    // the pasted link gets its own first visit.
    const linkContext = await browser.createBrowserContext()
    try {
      const page = await openPage({ phone, context: linkContext })
      await pickSource(page, 'Stream')
      await page.locator('#bpm-stream-url').fill('https://www.youtube.com/watch?v=abc')
      await page.waitForSelector('.bpm-link-note')
      assert.deepEqual(await micRequests(page), [])
      await page.locator('.bpm-mode-stream ::-p-text(next to your mic)').click()
      await page.waitForFunction(() => (window as unknown as { __micRequests: string[] }).__micRequests.length > 0)
      assert.equal((await micRequests(page)).length, 1)
      assert.match((await micRequests(page))[0], /next to your mic/i)
      await page.close()
    } finally {
      await linkContext.close()
    }
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
