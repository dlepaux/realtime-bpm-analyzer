// What the site promotes once the extension has a store listing (RBA-58). Every piece
// is derived from the store URL, null until the listing exists, so one value turns the
// whole promotion on: the /extension/ page, its nav link, the home card and the links
// from the tools. Pure and import-free so `npm test` runs it with node --test.

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
    requirement: 'For Chrome 150 or later, on a computer.',
  }]
}

/** Globs for VitePress's `srcExclude`. */
export function excludedSources(storeUrl: string | null): string[] {
  return storeUrl === null ? [EXTENSION_PAGE_SOURCE] : []
}

/** The main navigation's link. It goes after the library's items, whose order it leaves alone. */
export function extensionNavItems(storeUrl: string | null) {
  if (storeUrl === null) return []
  return [{ text: 'Extension', link: EXTENSION_PAGE, activeMatch: '^/extension/$' }]
}

// lucide's audio-lines, at the size and stroke of the home page's other cards.
const FEATURE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/><path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/></svg>'

/** The home page's card, in the same row as the free tools. */
export function extensionHomeFeatures(storeUrl: string | null) {
  if (storeUrl === null) return []
  return [{
    icon: FEATURE_ICON,
    title: 'Live BPM Detector',
    details: 'A Chrome extension that shows the tempo of what is playing in a tab, right on the player.',
    link: EXTENSION_PAGE,
    linkText: 'See the extension',
  }]
}

/**
 * Schema.org for the page. No `offers` and no rating: the page makes no pricing
 * promise, and there are no store ratings to report yet.
 */
export function extensionPageSchema(storeUrl: string, canonical: string, description: string) {
  return {
    '@type': 'SoftwareApplication',
    name: 'Live BPM Detector',
    description,
    url: canonical,
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Chrome',
    browserRequirements: 'Requires Chrome 150 or later.',
    installUrl: storeUrl,
    inLanguage: 'en',
    featureList: [
      'Shows the live BPM of the music playing in the current tab',
      'Audio is analysed on your device and never leaves it',
      'Notes the playback speed and the original tempo',
    ],
    author: { '@type': 'Person', name: 'David Lepaux', url: 'https://david.lepaux.com' },
  }
}
