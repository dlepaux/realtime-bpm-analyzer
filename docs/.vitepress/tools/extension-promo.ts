// What the site promotes once the extension has a store listing (RBA-58). Every piece
// is derived from the store URL, null until the listing exists, so one value turns the
// whole promotion on: the /extension/ page, its nav link, the home page's hero action
// and section, and the links from the tools. Pure and import-free so `npm test` runs it with node --test.

export const EXTENSION_PAGE = '/extension/'

// The page's source, relative to docs/. Excluded from the build while the switch is
// off, which takes it out of the routes, the sitemap and the search index all at once.
const EXTENSION_PAGE_SOURCE = 'extension/index.md'

// A listing's address: /detail/<id>, or /detail/<slug>/<id>, where an id is 32 letters
// from a to p. Edge Add-ons ids have the same shape as Chrome's.
const STORE_LISTING = /^https:\/\/chromewebstore\.google\.com\/detail\/(?:[^/?#]+\/)?[a-p]{32}\/?(?:[?#].*)?$/
const EDGE_LISTING = /^https:\/\/microsoftedge\.microsoft\.com\/addons\/detail\/(?:[^/?#]+\/)?[a-p]{32}\/?(?:[?#].*)?$/

/**
 * A listing's address without its query, or null while unset. Anything else throws, so a
 * placeholder fails the build instead of shipping a dead button. The query is dropped: a
 * dashboard's address can carry `hl` and `authuser`. Links that people click get their
 * label from `storeLink`.
 */
function resolveListing(raw: string | null, listing: RegExp, setting: string, store: string): string | null {
  if (raw === null) return null
  if (!listing.test(raw)) throw new Error(`${setting} must be a ${store} listing URL, got "${raw}"`)
  const { origin, pathname } = new URL(raw)
  return `${origin}${pathname.replace(/\/$/, '')}`
}

/** The Chrome listing install links use, or null while the switch is off. */
export function resolveStoreUrl(raw: string | null): string | null {
  return resolveListing(raw, STORE_LISTING, 'EXTENSION_STORE_URL', 'Chrome Web Store')
}

/** The Edge listing, or null when Edge has none. */
export function resolveEdgeUrl(raw: string | null): string | null {
  return resolveListing(raw, EDGE_LISTING, 'EXTENSION_EDGE_URL', 'Microsoft Edge Add-ons')
}

/** Where on the site a link to the extension sits. Sent with clicks and on store links. */
export const EXTENSION_PLACEMENTS = [
  'home_door',
  'home_touch',
  'extension_hero',
  'extension_closing',
  'extension_touch',
  'goodbye',
  'stream_hint',
  'result_mic',
  'result_stream',
  'tool_page',
] as const
export type ExtensionPlacement = (typeof EXTENSION_PLACEMENTS)[number]

/**
 * A store link for one place on the site, so the store's own acquisition report can say which
 * link brought an install (RBA-58). Doors that lead to /extension/ carry nothing through it, so that
 * report sees the page, and the site's own click events tell the doors apart. The label names the
 * site and the place, never the visitor.
 * The structured data keeps the plain address: it is what the listing is, not a click.
 */
export function storeLink(storeUrl: string, placement: ExtensionPlacement): string {
  const label = new URLSearchParams({
    utm_source: 'realtime-bpm-analyzer',
    utm_medium: 'website',
    utm_campaign: 'live-bpm-detector',
    utm_content: placement,
  })
  return `${storeUrl}?${label.toString()}`
}

export type StoreId = 'chrome' | 'edge'

export type InstallTarget = {
  readonly id: StoreId
  readonly browser: 'Chrome' | 'Edge'
  /** The store's own name, for links that go to the listing rather than install. */
  readonly store: string
  /** The store's name as a sentence says it: "on the Chrome Web Store", but "on Edge Add-ons". */
  readonly storeInText: string
  readonly label: string
  readonly href: string
}

// The one place the stores are named: buttons, links, the requirement line and click events read it.
const STORES: Record<StoreId, Omit<InstallTarget, 'href'>> = {
  chrome: { id: 'chrome', browser: 'Chrome', store: 'Chrome Web Store', storeInText: 'the Chrome Web Store', label: 'Add to Chrome' },
  edge: { id: 'edge', browser: 'Edge', store: 'Edge Add-ons', storeInText: 'Edge Add-ons', label: 'Add to Edge' },
}

// The extension's `minimum_chrome_version` (rba-pro extension/wxt.config.ts). Edge reads
// that same key against its Chromium version, and Edge's version numbers follow
// Chromium's, so one number is both browsers' minimum.
export const MINIMUM_BROWSER_VERSION = 150

/**
 * The browsers a visitor can install from today: another store joins as another entry
 * here. Install buttons render only from this list, so with no listing there is
 * nothing to render and no way to show a dead link. Chrome is the switch: Edge joins
 * only beside it, because without Chrome's listing there is no page to show it on.
 */
export function installTargets(
  storeUrl: string | null,
  edgeUrl: string | null,
  placement: ExtensionPlacement,
): readonly InstallTarget[] {
  if (storeUrl === null) return []
  const listings: readonly (readonly [StoreId, string | null])[] = [['chrome', storeUrl], ['edge', edgeUrl]]
  return listings.flatMap(([id, url]) => (url === null ? [] : [{ ...STORES[id], href: storeLink(url, placement) }]))
}

/** What the browser must be to install, one line under the buttons for every target. */
export function installRequirement(targets: readonly InstallTarget[]): string {
  const browsers = targets.map((target) => target.browser).join(' or ')
  return `Free. For ${browsers} ${MINIMUM_BROWSER_VERSION} or later, on a computer.`
}

/** Every listing a link may point at: what the switch check accepts. */
export function listingUrls(storeUrl: string | null, edgeUrl: string | null): readonly string[] {
  if (storeUrl === null) return []
  return edgeUrl === null ? [storeUrl] : [storeUrl, edgeUrl]
}

/** Globs for VitePress's `srcExclude`. */
export function excludedSources(storeUrl: string | null): string[] {
  return storeUrl === null ? [EXTENSION_PAGE_SOURCE] : []
}

/** The main navigation's link. It goes right after Free tools, ahead of the library's items. */
export function extensionNavItems(storeUrl: string | null) {
  if (storeUrl === null) return []
  return [{ text: 'Browser extension', link: EXTENSION_PAGE, activeMatch: '^/extension/$' }]
}

/**
 * The About menu's link to the extension's privacy policy. The page itself always builds,
 * because the installed extension links to it, but the site only points at it while there
 * is an extension to install.
 */
export function extensionPrivacyNavItems(storeUrl: string | null) {
  if (storeUrl === null) return []
  return [{ text: 'Extension privacy', link: '/extension/privacy' }]
}

export const EXTENSION_HERO_TAGLINE = 'Free BPM detection in your browser, and your audio stays on your device. Also an extension for Chrome and Edge, for the music in your tabs.'

/**
 * The home hero as the switch leaves it. The action to the extension's page is in its
 * door, ExtensionHomeBand.vue, which goes to the page because the page explains Chrome's
 * install prompt before anyone meets it. The page's meta description stays out of this:
 * RBA-11 holds the home page's title and description until its readbacks.
 */
export function extensionHomeHero<Hero extends { tagline: string }>(hero: Hero, storeUrl: string | null): Hero {
  if (storeUrl === null) return hero
  return { ...hero, tagline: EXTENSION_HERO_TAGLINE }
}

// A phone can't install it, so a phone's action is getting the page to a computer. No
// form and no parameter on the link: it is the same address anyone can copy.
export const SEND_LINK_URL = 'https://www.realtime-bpm-analyzer.com/extension/'
export const SEND_LINK_MAILTO = `mailto:?subject=${encodeURIComponent('Live BPM Detector')}&body=${encodeURIComponent(SEND_LINK_URL)}`

/**
 * Sends the page through the device's share sheet. Returns false when there is none, so
 * the link's own mailto runs. Closing the sheet is a choice, not a failure.
 */
export function sharePageLink(
  share: ((data: { title: string; url: string }) => Promise<void>) | undefined,
  openMail: () => void,
): boolean {
  if (share === undefined) return false
  share({ title: 'Live BPM Detector', url: SEND_LINK_URL }).catch((error: { name?: string }) => {
    if (error.name !== 'AbortError') openMail()
  })
  return true
}

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
  alt: 'Live BPM Detector, a free extension for Chrome and Edge: the overlay showing an example reading of 120 BPM, marked stable.',
} as const

/** llms.txt's line for the extension. */
export const EXTENSION_LLMS_LINE = `- [Live BPM Detector](${SEND_LINK_URL}): free extension for Chrome and Edge that shows the live BPM of the music playing in the current tab, on the page, with the audio analysed on the device`

/**
 * llms.txt with the extension in it, in its summary and ahead of the library, since
 * readers weight the top. Done at build time because the file is static. Throws if the
 * file's shape moved, so the line can't quietly go missing.
 */
export function llmsWithExtension(llms: string): string {
  const summary = 'tempo (BPM) work, plus the'
  const library = '## Library'
  if (!llms.includes(summary) || !llms.includes(library)) throw new Error('llms.txt changed shape: update llmsWithExtension')
  return llms
    .replace(summary, 'tempo (BPM) work, an extension for Chrome and Edge that shows the tempo of the music in a tab, plus the')
    .replace(library, `## Browser extension\n\n${EXTENSION_LLMS_LINE}\n\n${library}`)
}

/**
 * Schema.org for the page. The Offer says what the store says: free. No rating or
 * review, because there are none to report. Google's software-app rich result requires
 * one, so this earns no rich result and its test may warn: that is accepted, it stays
 * true. `softwareRequirements` because schema.org defines `browserRequirements` only on
 * WebApplication.
 */
export function extensionPageSchema(storeUrl: string, canonical: string, description: string, edgeUrl: string | null = null) {
  const browsers = edgeUrl === null ? 'Chrome' : 'Chrome or Microsoft Edge'
  // schema.org's operatingSystem is the system, not the browser: desktop Chrome and Edge run on these.
  return {
    '@type': 'SoftwareApplication',
    name: 'Live BPM Detector',
    description,
    url: canonical,
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Windows, macOS, Linux, ChromeOS',
    softwareRequirements: `${browsers} ${MINIMUM_BROWSER_VERSION} or later, on a computer`,
    installUrl: edgeUrl === null ? storeUrl : [storeUrl, edgeUrl],
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
