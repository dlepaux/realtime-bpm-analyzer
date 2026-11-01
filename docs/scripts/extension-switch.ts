// What a built site must look like in each state of EXTENSION_STORE_URL (RBA-58), as
// pure checks over the build's files. verify-extension-switch.ts runs them on real
// builds in CI; extension-switch.test.ts proves they catch what they claim to catch.

export type BuiltSite = {
  /** Every file, relative to the build's root, with forward slashes. */
  readonly paths: readonly string[]
  readonly read: (path: string) => string
  readonly size: (path: string) => number
}

// The address the check builds with: listing-shaped, with no listing behind it. An
// interrupted run could leave it in extension-config.ts, where the resolver would accept
// it, so extension-switch.test.ts fails if it is ever the committed value.
export const FIXTURE_STORE_URL = `https://chromewebstore.google.com/detail/live-bpm-detector/${'a'.repeat(32)}`

const SITE = 'https://www.realtime-bpm-analyzer.com'
const PAGE = 'extension/index.html'
const PAGE_LINK = 'href="/extension/"'
const INSTALL_BUTTON = /<a\b[^>]*\bext-install-btn\b[^>]*>/g
const STORE_LINK = /href="([^"]*chromewebstore[^"]*)"/g
const EMPTY_LINK = /<a\b[^>]*\bhref="(?:|null|undefined)"/
const SCREENSHOT = /\/(?:player|play-bar|playback-rate|no-audio)(?:-\d+)?\.[^/]*\.webp$/
const MAX_IMAGE_BYTES = 40_000

// Where a musician lands, and where the promo must not reach: a developer's page and
// the tool whose user already has the tempo.
const PROMO_PAGES = ['index.html', 'tap-tempo.html', 'metronome.html']
const NO_PROMO_PAGES = ['guide/getting-started.html', 'bpm-to-ms.html']

function checkOff(site: BuiltSite): string[] {
  const problems: string[] = []
  const expectAbsent = (condition: boolean, what: string) => {
    if (condition) problems.push(`off: ${what}`)
  }
  expectAbsent(site.paths.includes(PAGE), `${PAGE} was built, so the page is reachable`)
  expectAbsent(site.read('hashmap.json').includes('extension_index'), 'the page is in the hash map')
  expectAbsent(site.read('sitemap.xml').includes(`${SITE}/extension/</loc>`), 'the page is in the sitemap')
  expectAbsent(site.paths.some((path) => SCREENSHOT.test(`/${path}`)), 'the page\'s screenshots were published')
  expectAbsent(site.read('extension/goodbye.html').includes('Reinstall the extension'), 'goodbye offers a reinstall')
  for (const path of site.paths.filter((p) => p.includes('@localSearchIndex'))) {
    expectAbsent(site.read(path).includes('extension/#'), `the page is in the search index (${path})`)
  }
  for (const path of site.paths.filter((p) => p.endsWith('.html'))) {
    const html = site.read(path)
    expectAbsent(html.includes(PAGE_LINK), `${path} links to the page`)
    expectAbsent(STORE_LINK.test(html), `${path} links to the store`)
    STORE_LINK.lastIndex = 0
    expectAbsent(INSTALL_BUTTON.test(html), `${path} renders an install button`)
    INSTALL_BUTTON.lastIndex = 0
  }
  for (const path of PROMO_PAGES) {
    expectAbsent(site.read(path).includes('Live BPM Detector'), `${path} promotes the extension`)
  }
  return problems
}

function installProblems(site: BuiltSite, storeUrl: string): string[] {
  const problems: string[] = []
  for (const path of site.paths.filter((p) => p.endsWith('.html'))) {
    const html = site.read(path)
    for (const [, href] of html.matchAll(STORE_LINK)) {
      if (href !== storeUrl) problems.push(`on: ${path} links to ${href}, not the listing`)
    }
    for (const [tag] of html.matchAll(INSTALL_BUTTON)) {
      if (!tag.includes(`href="${storeUrl}"`)) problems.push(`on: ${path} has a dead install button: ${tag}`)
    }
  }
  const page = site.read(PAGE)
  if ([...page.matchAll(INSTALL_BUTTON)].length === 0) problems.push(`on: ${PAGE} has no install button`)
  if (EMPTY_LINK.test(page)) problems.push(`on: ${PAGE} has an empty link`)
  if (!site.read('extension/goodbye.html').includes(`<a href="${storeUrl}">Reinstall the extension`)) {
    problems.push('on: goodbye has no reinstall link to the listing')
  }
  return problems
}

function imageProblems(site: BuiltSite): string[] {
  const problems: string[] = []
  const screenshots = [...site.read(PAGE).matchAll(/<img\b[^>]*\bext-shot\b[^>]*>/g)].map(([tag]) => tag)
  if (screenshots.length === 0) problems.push(`on: ${PAGE} has no screenshots`)
  for (const tag of screenshots) {
    const label = tag.replace(/data:[^"]*/, 'data:...')
    // Sized, so the image's box is held before it loads, and described.
    for (const attribute of [/\bwidth="\d+"/, /\bheight="\d+"/, /\balt="[^"]+"/]) {
      if (!attribute.test(tag)) problems.push(`on: an image fails ${attribute}: ${label}`)
    }
    // Vite inlines the smallest images, which then have no file of their own to be missing.
    const inlined = /\bsrc="(data:image\/[^"]+)"/.exec(tag)?.[1]
    const src = /\bsrc="\/([^"]+)"/.exec(tag)?.[1]
    if (inlined !== undefined) {
      if (inlined.length > MAX_IMAGE_BYTES) problems.push(`on: an inlined image is over ${MAX_IMAGE_BYTES} bytes: ${label}`)
    } else if (src === undefined || !site.paths.includes(src)) {
      problems.push(`on: an image has no file: ${label}`)
    } else if (site.size(src) > MAX_IMAGE_BYTES) {
      problems.push(`on: ${src} is over ${MAX_IMAGE_BYTES} bytes`)
    }
  }
  return problems
}

function seoProblems(site: BuiltSite, storeUrl: string): string[] {
  const problems: string[] = []
  const page = site.read(PAGE)
  if (!/<title>[^<]*Live BPM Detector/.test(page)) problems.push('on: the title does not name the extension')
  if (!page.includes(`<link rel="canonical" href="${SITE}/extension/"`)) problems.push('on: wrong canonical')
  if (page.includes('noindex')) problems.push('on: the page is noindex')
  if (!page.includes('"@type":"SoftwareApplication"') || !page.includes(`"installUrl":"${storeUrl}"`)) {
    problems.push('on: no SoftwareApplication structured data with the listing')
  }
  const sitemap = site.read('sitemap.xml')
  if (!sitemap.includes(`${SITE}/extension/</loc>`)) problems.push('on: the page is not in the sitemap')
  if (sitemap.includes('extension/welcome')) problems.push('on: a users-only page is in the sitemap')
  return problems
}

function placementProblems(site: BuiltSite): string[] {
  const problems: string[] = []
  const home = site.read('index.html')
  if (!home.includes('See the extension')) problems.push('on: the home page has no card')
  if (!home.includes('Developer Docs')) problems.push('on: the home page lost its Developer Docs action')
  const guide = home.indexOf('href="/guide/getting-started"')
  const api = home.indexOf('href="/api/"')
  const extension = home.indexOf(PAGE_LINK)
  if (guide === -1 || api === -1 || extension < api || extension < guide) {
    problems.push('on: the library\'s nav items must come before the extension\'s')
  }
  for (const path of PROMO_PAGES) {
    if (!site.read(path).includes(PAGE_LINK)) problems.push(`on: ${path} has no link to the page`)
  }
  for (const path of ['tap-tempo.html', 'metronome.html']) {
    if (!site.read(path).includes('Live BPM Detector</a>')) problems.push(`on: ${path} has no mention`)
  }
  for (const path of NO_PROMO_PAGES) {
    if (site.read(path).includes('Live BPM Detector')) problems.push(`on: ${path} must not promote the extension`)
    if (!site.read(path).includes(PAGE_LINK)) problems.push(`on: ${path} has no nav link`)
  }
  return problems
}

/** What is wrong with this build for this value of the switch. Empty means it is right. */
export function switchProblems(site: BuiltSite, storeUrl: string | null): string[] {
  if (storeUrl === null) return checkOff(site)
  if (!site.paths.includes(PAGE)) return [`on: ${PAGE} was not built`]
  return [
    ...installProblems(site, storeUrl),
    ...imageProblems(site),
    ...seoProblems(site, storeUrl),
    ...placementProblems(site),
  ]
}
