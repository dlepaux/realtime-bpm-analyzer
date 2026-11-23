// What the BPM tool says when the browser blocks the microphone, so a visitor can allow it again or
// take an input that needs no mic, and the phone's note before a pasted link falls back to the mic,
// since a phone has no tab to share. Pure and import-free so `npm test` runs it with node --test.
// The browser is read in the page only, from its user agent, never stored or sent.
//
// The steps follow each browser's own help page as read on 2026-11-23, and use its menu names:
// - Chrome (Android and desktop): support.google.com/chrome/answer/2693767. On desktop, the
//   blocked list is headed "Not allowed to use your microphone" on Site settings › Microphone
// - Safari on iPhone and iPad: the iPhone User Guide, "tap the Page Menu button, tap Website
//   Settings, then tap the setting you want to change"
// - Safari on Mac: support.apple.com/guide/safari/websites-ibrwe2159f50/mac
// - Edge: support.microsoft.com, "Click the lock icon in the address bar, and change the setting
//   for the Microphone permission to Allow"
// - Firefox: support.mozilla.org/kb/how-manage-your-camera-and-microphone-permissions, the
//   permissions icon at the left of the address bar
// A browser outside that list, in-app browsers and WebViews included, gets the general steps:
// a wrong menu name is worse than none.

export type MicHelpBrowser = 'android_chrome' | 'ios_safari' | 'chrome' | 'edge' | 'firefox' | 'safari' | 'other'

export const MIC_BLOCKED_LINE = 'The microphone is blocked for this site.'

export const MIC_ALLOW_STEPS: Readonly<Record<MicHelpBrowser, string>> = {
  android_chrome: 'In Chrome, tap ⋮ › Settings › Site settings › Microphone, find this site under Blocked and tap Allow. Then try again.',
  ios_safari: 'In Safari, tap the Page Menu button in the address bar, then Website Settings, and set Microphone to Allow. Then try again.',
  chrome: 'In Chrome, open ⋮ › Settings › Privacy and security › Site settings › Microphone, select this site under “Not allowed to use your microphone” and set Microphone to Allow. Then try again.',
  edge: 'In Edge, select the lock icon in the address bar and set Microphone to Allow. Then try again.',
  firefox: 'In Firefox, select the permissions icon at the left of the address bar and clear the blocked microphone with ×. Then try again, and allow it when asked.',
  safari: 'In Safari, choose Safari › Settings › Websites › Microphone, and set this site to Allow. Then try again.',
  other: 'Open your browser’s settings for this site and set Microphone to Allow. Then try again.',
}

/**
 * Beside the button that starts listening: what the mic is for, and that its audio stays here,
 * so the browser's prompt that follows the press has its context (RBA-299).
 */
export const MIC_PURPOSE_LINE = 'Your microphone hears the music to find its tempo. The audio stays on this device.'

/** Shown on a phone, where a pasted link can only be heard through the mic: no tab to share. */
export const PHONE_LINK_LINE = 'The song has to play out loud near this phone.'

export type BrowserSignals = {
  readonly userAgent: string
  /** navigator.maxTouchPoints: iPadOS sends a Mac user agent, and only its touch screen tells it apart. */
  readonly maxTouchPoints: number
}

// Browsers built on Chrome's engine that keep its token in their user agent but have their own
// menus, and Android WebViews (in-app browsers), so they get the general steps. Brave sends
// Chrome's user agent unchanged, so it gets Chrome's steps.
const OTHER_CHROMIUM = /\b(?:OPR|Vivaldi|YaBrowser|SamsungBrowser|EdgA|UCBrowser)\/|; wv\)/
// On iOS every browser is WebKit. Only Safari itself ends in a Version/… Safari/ pair: in-app
// browsers (TikTok, Instagram…) drop the Safari token, and the other browsers add their own.
const IOS_SAFARI = /\bVersion\/[\d.]+.*\bSafari\//
const OTHER_IOS = /\b(?:CriOS|FxiOS|EdgiOS|OPiOS|GSA)\//

function isIos({ userAgent, maxTouchPoints }: BrowserSignals): boolean {
  return /\b(?:iPhone|iPad|iPod)\b/.test(userAgent) || (/\bMacintosh\b/.test(userAgent) && maxTouchPoints > 1)
}

export function micHelpBrowser(signals: BrowserSignals): MicHelpBrowser {
  const ua = signals.userAgent
  if (isIos(signals)) return IOS_SAFARI.test(ua) && !OTHER_IOS.test(ua) ? 'ios_safari' : 'other'
  if (/\bAndroid\b/.test(ua)) return /\bChrome\//.test(ua) && !OTHER_CHROMIUM.test(ua) ? 'android_chrome' : 'other'
  if (/\bEdg\//.test(ua)) return 'edge'
  if (/\bFirefox\//.test(ua)) return 'firefox'
  if (OTHER_CHROMIUM.test(ua)) return 'other'
  if (/\b(?:Headless)?Chrome\//.test(ua)) return 'chrome'
  if (/\bVersion\/[\d.]+.*\bSafari\//.test(ua)) return 'safari'
  return 'other'
}

/** A phone, not a tablet: Android puts "Mobile" only in its phones' user agents. */
export function isPhone(userAgent: string): boolean {
  return /\b(?:iPhone|iPod)\b/.test(userAgent) || (/\bAndroid\b/.test(userAgent) && /\bMobile\b/.test(userAgent))
}

export type MicPermission = 'granted' | 'denied' | 'prompt' | 'unknown'

type PermissionStatusLike = {
  readonly state: string
  addEventListener(type: 'change', listener: () => void): void
  removeEventListener(type: 'change', listener: () => void): void
}
export type PermissionsLike = { query(descriptor: { name: 'microphone' }): Promise<PermissionStatusLike> }

function asMicPermission(state: string): MicPermission {
  return state === 'granted' || state === 'denied' || state === 'prompt' ? state : 'unknown'
}

/**
 * Follows the mic permission where the browser reports it. Chrome on Android remembers a block per
 * site and refuses at once, with no prompt, so a returning visitor who blocked once would press a
 * button that can only fail: on `denied` the tool shows how to allow it instead. A browser that
 * can't query the microphone (older Firefox throws, some WebViews have no Permissions API) reports
 * `unknown`, and the help waits for a refusal. Returns the function that stops following.
 */
export function watchMicPermission(permissions: PermissionsLike | undefined, onState: (state: MicPermission) => void): () => void {
  let stopped = false
  let status: PermissionStatusLike | null = null
  const emit = () => { if (!stopped && status) onState(asMicPermission(status.state)) }
  if (!permissions) {
    onState('unknown')
    return () => { stopped = true }
  }
  permissions.query({ name: 'microphone' }).then(
    (result) => {
      if (stopped) return
      status = result
      result.addEventListener('change', emit)
      emit()
    },
    () => { if (!stopped) onState('unknown') },
  )
  return () => {
    stopped = true
    status?.removeEventListener('change', emit)
  }
}
