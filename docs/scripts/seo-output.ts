// What the built site must show search engines (RBA-122, RBA-129 and the structured
// data), as pure checks over the build's files. verify-seo.ts runs them on the real
// build in CI; seo-output.test.ts proves they catch what they claim to catch. The
// source tests can't see these: they come out of VitePress and config.ts together.
import type { BuiltSite } from './extension-switch.ts'
import { UNPUBLISHED_GUIDES } from '../.vitepress/tools/site-schema.ts'
import { legacyRedirects } from './legacy-redirects.ts'
import { targetFiles } from './redirects.ts'

export const HOME_H1 = 'BPM Finder: Find the BPM of Any Song'
const SITE = 'https://www.realtime-bpm-analyzer.com'

/**
 * Built HTML that is indexable yet left out of the sitemap on purpose, each with why.
 * Every other indexable page must be in the sitemap, so a page meant to rank can't drop
 * out of it unnoticed. Redirect stubs (legacy-redirects.ts) are left out by rule.
 */
export const NOT_IN_SITEMAP: readonly { readonly page: RegExp, readonly reason: string }[] = [
  { page: /^404\.html$/, reason: 'the page GitHub Pages answers a missing URL with' },
  { page: /^google4e3a3e9414465dcf\.html$/, reason: 'the Search Console verification file, not content' },
  {
    page: /^examples\/\d{2}-[a-z-]+\/index\.html$/,
    reason: 'a runnable example app, embedded in its examples/ page, which is the one that ranks',
  },
]
const H1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/g
// A <time> with text in it: the date is in the server HTML, not only added by JavaScript.
const FILLED_TIME = /<time\b[^>]*\bdatetime="[^"]+"[^>]*>[^<\s][^<]*<\/time>/

const LOC = /<loc>([^<]*)<\/loc>/g
const LINK = /<link\b[^>]*>/g
// Either attribute order, and any robots value that holds noindex ("noindex, nofollow").
const NOINDEX = /<meta\b(?=[^>]*\bname="robots")(?=[^>]*\bcontent="[^"]*\bnoindex)[^>]*>/
const DATE = (field: string) => new RegExp(`"${field}":"(\\d{4}-[^"]+)"`)

const isNoindex = (html: string) => NOINDEX.test(html)
const isRedirectStub = (path: string) => path in legacyRedirects
const isUnpublished = (path: string) => UNPUBLISHED_GUIDES.some((page) => path === `${page}.html`)

// The words between the tags of a fragment of our own build, for comparing, never for
// rendering. VitePress's markers (<!--[-->) are tags to this split too.
const text = (html: string) => html.split(/<[^>]*>/).join('').trim()

function homeProblems(site: BuiltSite): string[] {
  const home = site.read('index.html')
  const h1s = [...home.matchAll(H1)].map((match) => text(match[1] ?? ''))
  const problems: string[] = []
  if (h1s.length !== 1) problems.push(`home: ${h1s.length} h1 elements, expected 1`)
  else if (h1s[0] !== HOME_H1) problems.push(`home: the h1 reads "${h1s[0]}"`)
  if (!home.includes('Maintained by') || !FILLED_TIME.test(home)) problems.push('home: no byline with a date')
  return problems
}

function unpublishedProblems(site: BuiltSite): string[] {
  const problems: string[] = []
  const sitemap = site.read('sitemap.xml')
  for (const page of UNPUBLISHED_GUIDES) {
    if (!isNoindex(site.read(`${page}.html`))) problems.push(`${page}: not noindex`)
    if (sitemap.includes(`${SITE}/${page}<`)) problems.push(`${page}: in the sitemap`)
  }
  const link = new RegExp(`href="/(${UNPUBLISHED_GUIDES.join('|')})(\\.html)?["#]`)
  const linking = site.paths
    .filter((path) => path.endsWith('.html') && !isUnpublished(path))
    .filter((path) => link.test(site.read(path)))
  return [...problems, ...linking.map((path) => `${path}: links to an unpublished guide`)]
}

function guideProblems(site: BuiltSite): string[] {
  const guides = site.paths.filter((path) => /^guide\/[^/]+\.html$/.test(path))
    .filter((path) => !isUnpublished(path))
    // Legacy URLs such as guide/quick-start.html are redirect stubs (build-redirects.ts).
    .filter((path) => !isRedirectStub(path))
  if (guides.length < 5) return [`only ${guides.length} guides built`]
  return guides.flatMap((path) => {
    const html = site.read(path)
    const published = DATE('datePublished').exec(html)?.[1]
    const modified = DATE('dateModified').exec(html)?.[1]
    return [
      html.includes('"@type":"TechArticle"') ? null : `${path}: no TechArticle`,
      published ? null : `${path}: no datePublished`,
      modified ? null : `${path}: no dateModified`,
      // A shallow clone dates every page to its one commit; this catches the half of it
      // that can show, a first commit after the last change.
      published && modified && Date.parse(published) > Date.parse(modified)
        ? `${path}: datePublished ${published} is after dateModified ${modified}` : null,
      html.includes('<meta property="og:type" content="article"') ? null : `${path}: og:type is not article`,
      FILLED_TIME.test(html) ? null : `${path}: the last-updated date is empty in the HTML`,
    ].filter((problem): problem is string => problem !== null)
  })
}

// The page a sitemap URL names, as GitHub Pages would serve it, or undefined if none is built.
function pageOf(site: BuiltSite, url: string): string | undefined {
  return targetFiles(url.slice(SITE.length)).find((file) => site.paths.includes(file))
}

// A built page's URL in the sitemap's form, the cleanUrls one: guide/node.html is
// /guide/node, guide/index.html is /guide/.
const urlOf = (path: string) => `${SITE}/${path.replace(/\.html$/, '').replace(/(^|\/)index$/, '$1')}`

function canonicalsOf(html: string): string[] {
  return [...html.matchAll(LINK)].map((match) => match[0])
    .filter((tag) => /\brel="canonical"/.test(tag))
    .map((tag) => /\bhref="([^"]*)"/.exec(tag)?.[1] ?? '')
}

// Both directions between the sitemap and the pages: what it lists is indexable, has a
// canonical to itself and exists; what is indexable is in it, apart from NOT_IN_SITEMAP.
function sitemapProblems(site: BuiltSite): string[] {
  const urls = [...site.read('sitemap.xml').matchAll(LOC)].map((match) => (match[1] ?? '').trim())
  const listed = urls.flatMap((url): string[] => {
    if (!url.startsWith(`${SITE}/`)) return [`sitemap: ${url} is not on ${SITE}`]
    const page = pageOf(site, url)
    if (page === undefined) return [`sitemap: ${url} has no built page`]
    const html = site.read(page)
    const canonicals = canonicalsOf(html)
    return [
      isNoindex(html) ? `${url}: in the sitemap but noindex` : null,
      canonicals.length === 1 && canonicals[0] === url ? null
        : `${url}: canonical is ${canonicals.length === 0 ? 'missing' : canonicals.join(', ')}, expected the sitemap URL`,
    ].filter((problem): problem is string => problem !== null)
  })
  const inSitemap = new Set(urls)
  const missing = site.paths
    .filter((path) => path.endsWith('.html') && !isRedirectStub(path))
    .filter((path) => !NOT_IN_SITEMAP.some(({ page }) => page.test(path)))
    .filter((path) => !inSitemap.has(urlOf(path)) && !isNoindex(site.read(path)))
    .map((path) => `${path}: indexable but not in the sitemap`)
  return [...listed, ...missing]
}

export function seoProblems(site: BuiltSite): string[] {
  const emptyGraph = site.paths.filter((path) => path.endsWith('.html') && site.read(path).includes('"@graph":[]'))
  return [
    ...homeProblems(site),
    ...unpublishedProblems(site),
    ...guideProblems(site),
    ...sitemapProblems(site),
    ...emptyGraph.map((path) => `${path}: an empty @graph`),
  ]
}
