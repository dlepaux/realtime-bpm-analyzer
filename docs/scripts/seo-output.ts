// What the built site must show search engines (RBA-122, RBA-129 and the structured
// data), as pure checks over the build's files. verify-seo.ts runs them on the real
// build in CI; seo-output.test.ts proves they catch what they claim to catch. The
// source tests can't see these: they come out of VitePress and config.ts together.
import type { BuiltSite } from './extension-switch.ts'

export const HOME_H1 = 'BPM Finder: Find the BPM of Any Song'
const UNPUBLISHED = ['guide/cli', 'guide/mcp']
const SITE = 'https://www.realtime-bpm-analyzer.com'
const H1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/g
// A <time> with text in it: the date is in the server HTML, not only added by JavaScript.
const FILLED_TIME = /<time\b[^>]*\bdatetime="[^"]+"[^>]*>[^<\s][^<]*<\/time>/

const text = (html: string) => html.replace(/<!--[\s\S]*?-->|<[^>]+>/g, '').trim()

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
  for (const page of UNPUBLISHED) {
    if (!/<meta name="robots" content="noindex"/.test(site.read(`${page}.html`))) problems.push(`${page}: not noindex`)
    if (sitemap.includes(`${SITE}/${page}<`)) problems.push(`${page}: in the sitemap`)
  }
  const link = new RegExp(`href="/(${UNPUBLISHED.join('|')})(\\.html)?["#]`)
  const linking = site.paths
    .filter((path) => path.endsWith('.html') && !UNPUBLISHED.some((page) => path === `${page}.html`))
    .filter((path) => link.test(site.read(path)))
  return [...problems, ...linking.map((path) => `${path}: links to an unpublished guide`)]
}

function guideProblems(site: BuiltSite): string[] {
  const guides = site.paths.filter((path) => /^guide\/[^/]+\.html$/.test(path))
    .filter((path) => !UNPUBLISHED.some((page) => path === `${page}.html`))
  if (guides.length < 5) return [`only ${guides.length} guides built`]
  return guides.flatMap((path) => {
    const html = site.read(path)
    return [
      html.includes('"@type":"TechArticle"') ? null : `${path}: no TechArticle`,
      /"dateModified":"\d{4}-/.test(html) ? null : `${path}: no dateModified`,
      html.includes('<meta property="og:type" content="article"') ? null : `${path}: og:type is not article`,
      FILLED_TIME.test(html) ? null : `${path}: the last-updated date is empty in the HTML`,
    ].filter((problem): problem is string => problem !== null)
  })
}

export function seoProblems(site: BuiltSite): string[] {
  const emptyGraph = site.paths.filter((path) => path.endsWith('.html') && site.read(path).includes('"@graph":[]'))
  return [
    ...homeProblems(site),
    ...unpublishedProblems(site),
    ...guideProblems(site),
    ...emptyGraph.map((path) => `${path}: an empty @graph`),
  ]
}
