// Which browser the visitor is in, and what the install block offers them there (RBA-58). Pure,
// so the server render and the tests use the same rules. Read in the page only, never stored or
// sent: the one thing that leaves is the store name on a click, as before.
import type { InstallTarget, StoreId } from './extension-promo'

export type VisitorBrowser = 'chrome' | 'edge' | 'firefox' | 'other-chromium' | 'safari' | 'touch' | 'unknown'

/** What the page can read: `navigator.userAgentData` brands where the browser has them. */
export type BrowserSignals = {
  readonly brands: readonly string[] | null
  readonly userAgent: string
  /** The site's one device check, TOUCH_QUERY, matched. */
  readonly touch: boolean
}

// The device check shared by the CSS and the page: a phone or tablet, which can't install an
// extension. Every stylesheet uses this exact query; extension-promo.test.ts holds them to it.
export const TOUCH_QUERY = '(pointer: coarse)'

// Chromium browsers name themselves in their brands; anything else in the list is padding.
function fromBrands(brands: readonly string[]): VisitorBrowser | null {
  if (brands.includes('Microsoft Edge')) return 'edge'
  if (brands.includes('Google Chrome')) return 'chrome'
  if (brands.includes('Chromium')) return 'other-chromium'
  return null
}

// Most specific first: Edge, Opera and Vivaldi all carry Chrome's token, and Chrome carries Safari's.
const USER_AGENT_RULES: readonly (readonly [RegExp, VisitorBrowser])[] = [
  [/\bEdg\//, 'edge'],
  [/\b(?:OPR|Vivaldi|YaBrowser|SamsungBrowser)\//, 'other-chromium'],
  [/\bFirefox\//, 'firefox'],
  [/\bChrome\//, 'chrome'],
  [/\bVersion\/[\d.]+.*\bSafari\//, 'safari'],
]

export function detectBrowser({ brands, userAgent, touch }: BrowserSignals): VisitorBrowser {
  if (touch) return 'touch'
  const branded = brands && brands.length > 0 ? fromBrands(brands) : null
  if (branded) return branded
  return USER_AGENT_RULES.find(([pattern]) => pattern.test(userAgent))?.[1] ?? 'unknown'
}

// The part of `navigator` this reads. userAgentData is Chromium's, and missing from TypeScript's DOM types.
type NavigatorLike = {
  readonly userAgent: string
  readonly userAgentData?: { readonly brands: readonly { readonly brand: string }[] }
}

export function readSignals(nav: NavigatorLike, touch: boolean): BrowserSignals {
  return { brands: nav.userAgentData?.brands.map(({ brand }) => brand) ?? null, userAgent: nav.userAgent, touch }
}

export type InstallButton = InstallTarget & {
  readonly primary: boolean
  readonly title: string
  readonly subtitle: string
}

export type InstallOffer = {
  readonly buttons: readonly InstallButton[]
  /** One line for the visitor's own browser, or null when the requirement line says it all. */
  readonly context: string | null
}

// Which store leads. The rest keep the order of the targets, Chrome first.
const LEAD: Partial<Record<VisitorBrowser, StoreId>> = { edge: 'edge' }

// Browsers that install from neither store. A filled button there would point at the one thing
// the visitor can't do in it, so every button stays outlined and the words carry the offer.
const NOTHING_FILLED: ReadonlySet<VisitorBrowser> = new Set(['firefox', 'safari'])

const CONTEXT: Partial<Record<VisitorBrowser, string>> = {
  firefox: 'A Firefox version is on its way.',
}

function button(target: InstallTarget, primary: boolean, browser: VisitorBrowser): InstallButton {
  // Opera, Brave and the like install from Chrome's store, but the site hasn't checked them by
  // hand, so the words name the store and never the browser.
  const unnamed = browser === 'other-chromium' && target.id === 'chrome'
  return {
    ...target,
    primary,
    title: unnamed ? 'Install it free' : target.label,
    subtitle: unnamed ? `from ${target.storeInText}` : target.store,
  }
}

/** The buttons for this browser. 'unknown' is the neutral offer the server renders. */
export function installOffer(targets: readonly InstallTarget[], browser: VisitorBrowser): InstallOffer {
  const lead = LEAD[browser]
  const ordered = [...targets].sort((a, b) => Number(b.id === lead) - Number(a.id === lead))
  const filled = !NOTHING_FILLED.has(browser)
  return {
    buttons: ordered.map((target, index) => button(target, filled && index === 0, browser)),
    context: CONTEXT[browser] ?? null,
  }
}
