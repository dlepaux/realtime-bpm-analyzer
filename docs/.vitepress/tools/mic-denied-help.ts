// What the BPM tool says when the microphone is blocked (RBA-299), and the phone's note before a
// pasted link falls back to the mic (RBA-300). Pure and import-free so `npm test` runs it with
// node --test. The browser is read in the page only, from its user agent, never stored or sent.
//
// The steps follow each browser's own help page as read on 2026-11-23, and use its menu names:
// - Chrome (Android and desktop): support.google.com/chrome/answer/2693767
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
  chrome: 'In Chrome, open ⋮ › Settings › Privacy and security › Site settings, select this site under “Not allowed to use your camera or microphone” and set Microphone to Allow. Then try again.',
  edge: 'In Edge, select the lock icon in the address bar and set Microphone to Allow. Then try again.',
  firefox: 'In Firefox, select the permissions icon at the left of the address bar and clear the blocked microphone with ×. Then try again, and allow it when asked.',
  safari: 'In Safari, choose Safari › Settings › Websites › Microphone, and set this site to Allow. Then try again.',
  other: 'Open your browser’s settings for this site and set Microphone to Allow. Then try again.',
}

/** Shown on a phone, where a pasted link can only be heard through the mic: no tab to share. */
export const PHONE_LINK_LINE = 'The song has to play out loud near this phone.'

export type BrowserSignals = {
  readonly userAgent: string
  /** navigator.maxTouchPoints: iPadOS sends a Mac user agent, and only its touch screen tells it apart. */
  readonly maxTouchPoints: number
}

// Browsers built on Chrome's or Safari's engine that keep those tokens in their user agent but
// have their own menus, so they get the general steps.
const OTHER_CHROMIUM = /\b(?:OPR|Vivaldi|YaBrowser|SamsungBrowser|EdgA|UCBrowser|Brave)\/|; wv\)/
const OTHER_IOS = /\b(?:CriOS|FxiOS|EdgiOS|OPiOS|GSA|FBAN|FBAV|Instagram)\b/

function isIos({ userAgent, maxTouchPoints }: BrowserSignals): boolean {
  return /\b(?:iPhone|iPad|iPod)\b/.test(userAgent) || (/\bMacintosh\b/.test(userAgent) && maxTouchPoints > 1)
}

export function micHelpBrowser(signals: BrowserSignals): MicHelpBrowser {
  const ua = signals.userAgent
  if (isIos(signals)) return OTHER_IOS.test(ua) ? 'other' : 'ios_safari'
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
