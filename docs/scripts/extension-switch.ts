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
const SHARE_IMAGE = 'live-bpm-detector-share.png'
const MAX_SHARE_IMAGE_BYTES = 300_000
const HERO_ACTION = 'Live BPM Detector for Chrome'
const HOME_SECTION = 'ext-band'
const HOME_TAGLINE = 'Chrome extension for the music in your tabs'
const BANNED_MARKUP = /aggregateRating|ratingValue|reviewCount|"review"/

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
  expectAbsent(site.paths.includes(SHARE_IMAGE), 'the share image was published')
  expectAbsent(site.read('llms.txt').includes('Live BPM Detector'), 'llms.txt names the extension')
  expectAbsent(site.read('index.html').includes(HERO_ACTION), 'the home hero has the extension\'s action')
  expectAbsent(site.read('index.html').includes(HOME_SECTION), 'the home page has the extension\'s section')
  expectAbsent(site.read('index.html').includes(HOME_TAGLINE), 'the home tagline names the extension')
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
    expectAbsent(html.includes('"name":"Live BPM Detector"'), `${path} carries the extension's structured data`)
    expectAbsent(html.includes(SHARE_IMAGE), `${path} points at the extension's share image`)
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
  if (!page.includes('"price":"0"')) problems.push('on: the structured data does not say it is free')
  if (BANNED_MARKUP.test(page)) problems.push('on: the structured data carries a rating or review')
  if (!/<h1\b[\s\S]*Live BPM Detector[\s\S]*<\/h1>/.test(page)) problems.push('on: the h1 does not name the extension')
  const sitemap = site.read('sitemap.xml')
  if (!sitemap.includes(`${SITE}/extension/</loc>`)) problems.push('on: the page is not in the sitemap')
  if (sitemap.includes('extension/welcome')) problems.push('on: a users-only page is in the sitemap')
  const llms = site.read('llms.txt')
  const llmsLine = llms.indexOf(`[Live BPM Detector](${SITE}/extension/)`)
  if (llmsLine === -1 || llmsLine > llms.indexOf('## Library')) problems.push('on: llms.txt must list the extension ahead of the library')
  if (!/<meta property="og:title" content="[^"]*Live BPM Detector[^"|]*"/.test(page)) problems.push('on: the page\'s og:title is wrong or has the site suffix')
  return problems
}

function shareProblems(site: BuiltSite): string[] {
  const problems: string[] = []
  const ownImage = `<meta property="og:image" content="${SITE}/${SHARE_IMAGE}"`
  if (!site.paths.includes(SHARE_IMAGE)) problems.push(`on: ${SHARE_IMAGE} was not published`)
  else if (site.size(SHARE_IMAGE) > MAX_SHARE_IMAGE_BYTES) problems.push(`on: ${SHARE_IMAGE} is over ${MAX_SHARE_IMAGE_BYTES} bytes`)
  if (!site.read(PAGE).includes(ownImage)) problems.push('on: the page does not share its own image')
  if (site.read(PAGE).split('property="og:image"').length !== 2) problems.push('on: the page has more than one og:image')
  if (site.read('index.html').includes(ownImage)) problems.push('on: the home page shares the extension\'s image')
  return problems
}

function placementProblems(site: BuiltSite): string[] {
  const problems: string[] = []
  const home = site.read('index.html')
  if (!home.includes(HERO_ACTION)) problems.push('on: the home hero has no action for the extension')
  if (!home.includes(HOME_SECTION)) problems.push('on: the home page has no section for the extension')
  if (!home.includes(HOME_TAGLINE)) problems.push('on: the home tagline does not name the extension')
  if (!home.includes('Developer Docs')) problems.push('on: the home page lost its Developer Docs action')
  // Read off a page with no other link to it, so this is the nav's order.
  const nav = site.read('bpm-to-ms.html')
  const extension = nav.indexOf(PAGE_LINK)
  const guide = nav.indexOf('href="/guide/getting-started"')
  const api = nav.indexOf('href="/api/"')
  if (extension === -1 || guide === -1 || api === -1 || extension > guide) {
    problems.push('on: the extension\'s nav item must come before the library\'s, which must stay')
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
    ...shareProblems(site),
    ...placementProblems(site),
  ]
}
