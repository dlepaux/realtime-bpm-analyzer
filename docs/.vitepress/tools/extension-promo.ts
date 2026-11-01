// What the site promotes once the extension has a store listing (RBA-58). Every piece
// is derived from the store URL, null until the listing exists, so one value turns the
// whole promotion on: the /extension/ page, its nav link, the home page's hero action
// and section, and the links from the tools. Pure and import-free so `npm test` runs it with node --test.

export const EXTENSION_PAGE = '/extension/'

// The page's source, relative to docs/. Excluded from the build while the switch is
// off, which takes it out of the routes, the sitemap and the search index all at once.
const EXTENSION_PAGE_SOURCE = 'extension/index.md'

// A listing's address: /detail/<id>, or /detail/<slug>/<id>, where an id is 32 letters
// from a to p.
const STORE_LISTING = /^https:\/\/chromewebstore\.google\.com\/detail\/(?:[^/?#]+\/)?[a-p]{32}\/?(?:[?#].*)?$/

/**
 * The URL install links use, or null while the switch is off. Anything else that isn't
 * a listing throws, so a placeholder fails the build instead of shipping a dead button.
 * The query is dropped: the dashboard's address can carry `hl` and `authuser`, and the
 * site adds no tracking parameters to a link.
 */
export function resolveStoreUrl(raw: string | null): string | null {
  if (raw === null) return null
  if (!STORE_LISTING.test(raw)) {
    throw new Error(`EXTENSION_STORE_URL must be a Chrome Web Store listing URL, got "${raw}"`)
  }
  const { origin, pathname } = new URL(raw)
  return `${origin}${pathname.replace(/\/$/, '')}`
}

export type InstallTarget = {
  readonly browser: string
  readonly label: string
  readonly href: string
  /** What the browser must be to install, shown beside the button. */
  readonly requirement: string
}

/**
 * The browsers a visitor can install from today: another store joins as another entry
 * here. Install buttons render only from this list, so with no listing there is
 * nothing to render and no way to show a dead link. The minimum comes from the
 * extension's `minimum_chrome_version` (rba-pro extension/wxt.config.ts).
 */
export function installTargets(storeUrl: string | null): readonly InstallTarget[] {
  if (storeUrl === null) return []
  return [{
    browser: 'Chrome',
    label: 'Add to Chrome',
    href: storeUrl,
    requirement: 'Free. For Chrome 150 or later, on a computer.',
  }]
}

/** Globs for VitePress's `srcExclude`. */
export function excludedSources(storeUrl: string | null): string[] {
  return storeUrl === null ? [EXTENSION_PAGE_SOURCE] : []
}

/** The main navigation's link. It goes right after Free Tools, ahead of the library's items. */
export function extensionNavItems(storeUrl: string | null) {
  if (storeUrl === null) return []
  return [{ text: 'Chrome Extension', link: EXTENSION_PAGE, activeMatch: '^/extension/$' }]
}

/**
 * The home hero's action. It goes to the page rather than the store, because the page
 * explains Chrome's install prompt before anyone meets it. The home page's section is
 * ExtensionHomeBand.vue.
 */
export function extensionHeroActions(storeUrl: string | null) {
  if (storeUrl === null) return []
  return [{ theme: 'brand', text: 'Live BPM Detector for Chrome', link: EXTENSION_PAGE }]
}

// A phone can't install it, so a phone's action is getting the page to a computer. No
// form and no parameter on the link: it is the same address anyone can copy.
export const SEND_LINK_URL = 'https://www.realtime-bpm-analyzer.com/extension/'
export const SEND_LINK_MAILTO = `mailto:?subject=${encodeURIComponent('Live BPM Detector')}&body=${encodeURIComponent(SEND_LINK_URL)}`

// The linked platforms where the store listing says it works. The analyzer also
// recognises Spotify, Apple Music and Deezer links, which the extension doesn't promise.
const COVERED_PLATFORMS: readonly string[] = ['youtube', 'soundcloud', 'bandcamp']

/** Whether the analyzer may suggest the extension for a link to this platform. */
export function extensionCovers(platform: string | null): boolean {
  return platform !== null && COVERED_PLATFORMS.includes(platform)
}

/** The page's share image. buildEnd publishes it only while the switch is on. */
export const EXTENSION_SHARE_IMAGE = {
  file: 'live-bpm-detector-share.png',
  width: 1200,
  height: 630,
  alt: 'Live BPM Detector, a free Chrome extension: the overlay showing an example reading of 120 BPM, marked stable.',
} as const

/** llms.txt's line for the extension, added at build time because the file is static. */
export const EXTENSION_LLMS_LINE = `- [Live BPM Detector](${SEND_LINK_URL}): free Chrome extension that shows the live BPM of the music playing in the current tab, on the page, with the audio analysed on the device`

/**
 * Schema.org for the page. The Offer says what the store says: free. No rating or
 * review, because there are none to report. Google's software-app rich result requires
 * one, so this earns no rich result and its test may warn: that is accepted, it stays
 * true. `softwareRequirements` because schema.org defines `browserRequirements` only on
 * WebApplication.
 */
export function extensionPageSchema(storeUrl: string, canonical: string, description: string) {
  return {
    '@type': 'SoftwareApplication',
    name: 'Live BPM Detector',
    description,
    url: canonical,
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Chrome',
    softwareRequirements: 'Chrome 150 or later, on a computer',
    installUrl: storeUrl,
    inLanguage: 'en',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    featureList: [
      'Shows the live BPM of the music playing in the current tab',
      'Audio is analysed on your device and never leaves it',
      'Notes the playback speed and the original tempo',
    ],
    author: { '@type': 'Person', name: 'David Lepaux', url: 'https://david.lepaux.com' },
  }
}
