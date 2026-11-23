// Run with `npm test` (node --test, Node's own type stripping; no test framework).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MIC_ALLOW_STEPS,
  MIC_BLOCKED_LINE,
  MIC_PURPOSE_LINE,
  PHONE_LINK_LINE,
  isPhone,
  micHelpBrowser,
  watchMicPermission,
  type MicPermission,
  type PermissionsLike,
} from '../.vitepress/tools/mic-denied-help.ts'

// Real user agents, current majors as of 2026-11.
const UA = {
  androidChrome: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
  androidTabletChrome: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  androidSamsung: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/29.0 Chrome/136.0.0.0 Mobile Safari/537.36',
  androidWebView: 'Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/142.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 15; Mobile; rv:145.0) Gecko/145.0 Firefox/145.0',
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1',
  iphoneTikTok: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_42.1.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/en Region/US',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0.7444.77 Mobile/15E148 Safari/604.1',
  // iPadOS asks for the desktop site by default: a Mac user agent on a touch screen.
  ipadSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  winEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0',
  winFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0',
  winOpera: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 OPR/124.0.0.0',
  headless: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/142.0.0.0 Safari/537.36',
} as const

test('each browser gets its own steps, and anything unknown the general ones', () => {
  const cases: [string, number, ReturnType<typeof micHelpBrowser>][] = [
    [UA.androidChrome, 5, 'android_chrome'],
    [UA.androidTabletChrome, 5, 'android_chrome'],
    [UA.androidSamsung, 5, 'other'],
    [UA.androidWebView, 5, 'other'],
    [UA.androidFirefox, 5, 'other'],
    [UA.iphoneSafari, 5, 'ios_safari'],
    [UA.iphoneChrome, 5, 'other'],
    [UA.iphoneTikTok, 5, 'other'],
    [UA.ipadSafari, 5, 'ios_safari'],
    [UA.macSafari, 0, 'safari'],
    [UA.macChrome, 0, 'chrome'],
    [UA.winEdge, 0, 'edge'],
    [UA.winFirefox, 0, 'firefox'],
    [UA.winOpera, 0, 'other'],
    [UA.headless, 0, 'chrome'],
    ['', 0, 'other'],
  ]
  for (const [userAgent, maxTouchPoints, expected] of cases) {
    assert.equal(micHelpBrowser({ userAgent, maxTouchPoints }), expected, userAgent)
  }
})

test('the steps name each browser and the Allow choice, and the fallback names none', () => {
  assert.match(MIC_ALLOW_STEPS.android_chrome, /^In Chrome, .*Site settings.*Microphone.*Blocked.*Allow/)
  assert.match(MIC_ALLOW_STEPS.ios_safari, /^In Safari, .*Page Menu.*Website Settings.*Microphone.*Allow/)
  assert.match(MIC_ALLOW_STEPS.chrome, /^In Chrome, .*Privacy and security.*Site settings.*Microphone.*Allow/)
  assert.match(MIC_ALLOW_STEPS.edge, /^In Edge, .*lock icon.*Allow/)
  assert.match(MIC_ALLOW_STEPS.firefox, /^In Firefox, .*address bar/)
  assert.match(MIC_ALLOW_STEPS.safari, /^In Safari, .*Settings.*Websites.*Microphone.*Allow/)
  assert.doesNotMatch(MIC_ALLOW_STEPS.other, /Chrome|Safari|Edge|Firefox/)
})

test('the copy blames no one and claims nothing', () => {
  for (const line of [MIC_BLOCKED_LINE, PHONE_LINK_LINE, ...Object.values(MIC_ALLOW_STEPS)]) {
    assert.doesNotMatch(line, /\byou (denied|refused|blocked)\b|\bbest\b|accura|%/i, line)
  }
})

test('a phone is an iPhone or an Android phone, never a tablet or a desktop', () => {
  assert.equal(isPhone(UA.androidChrome), true)
  assert.equal(isPhone(UA.androidSamsung), true)
  assert.equal(isPhone(UA.androidFirefox), true)
  assert.equal(isPhone(UA.iphoneSafari), true)
  assert.equal(isPhone(UA.iphoneChrome), true)
  assert.equal(isPhone(UA.androidTabletChrome), false)
  assert.equal(isPhone(UA.ipadSafari), false)
  assert.equal(isPhone(UA.macChrome), false)
  assert.equal(isPhone(UA.winEdge), false)
})

// A Permissions API double: the state it reports, and the change listeners it holds.
function fakePermissions(initial: string) {
  const listeners = new Set<() => void>()
  const status = {
    state: initial,
    addEventListener: (_: 'change', listener: () => void) => { listeners.add(listener) },
    removeEventListener: (_: 'change', listener: () => void) => { listeners.delete(listener) },
  }
  const permissions: PermissionsLike = { query: async () => status }
  return { permissions, listeners, change(state: string) { status.state = state; listeners.forEach((l) => l()) } }
}
const settle = () => new Promise((resolve) => setImmediate(resolve))

test('a site blocked earlier reports denied before any press, and follows the visitor allowing it', async () => {
  const fake = fakePermissions('denied')
  const seen: MicPermission[] = []
  const stop = watchMicPermission(fake.permissions, (state) => seen.push(state))
  await settle()
  fake.change('granted')
  assert.deepEqual(seen, ['denied', 'granted'])
  stop()
  assert.equal(fake.listeners.size, 0)
  fake.change('denied')
  assert.deepEqual(seen, ['denied', 'granted'])
})

test('a browser that cannot query the mic reports unknown, so the help waits for a refusal', async () => {
  const seen: MicPermission[] = []
  watchMicPermission(undefined, (state) => seen.push(state))
  watchMicPermission({ query: () => Promise.reject(new TypeError('microphone is not a valid permission name')) }, (state) => seen.push(state))
  watchMicPermission(fakePermissions('something-new').permissions, (state) => seen.push(state))
  await settle()
  assert.deepEqual(seen, ['unknown', 'unknown', 'unknown'])
})

test('a stop before the query answers reports nothing', async () => {
  const seen: MicPermission[] = []
  watchMicPermission(fakePermissions('denied').permissions, (state) => seen.push(state))()
  await settle()
  assert.deepEqual(seen, [])
})

test('the line beside the mic button says what it is for and that the audio stays here, with no claim', () => {
  assert.match(MIC_PURPOSE_LINE, /tempo/)
  assert.match(MIC_PURPOSE_LINE, /stays on this device/)
  assert.doesNotMatch(MIC_PURPOSE_LINE, /accura|best|precise|\d+ ?%/i)
})

test('Brave, which sends Chrome user agent unchanged, gets the general steps, not Chrome menus', () => {
  assert.equal(micHelpBrowser({ userAgent: UA.macChrome, maxTouchPoints: 0, brave: true }), 'other')
  assert.equal(micHelpBrowser({ userAgent: UA.androidChrome, maxTouchPoints: 5, brave: true }), 'other')
  assert.equal(micHelpBrowser({ userAgent: UA.macChrome, maxTouchPoints: 0, brave: false }), 'chrome')
})
