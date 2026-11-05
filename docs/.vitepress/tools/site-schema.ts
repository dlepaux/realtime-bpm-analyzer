// The site's schema.org data, and which page gets which. Pure and import-free so
// `npm test` runs it with node --test.
//
//   - SoftwareSourceCode: the open-source library, on the pages about it. It isn't what
//     Tap Tempo or a legal page describes, and Google asks that markup represent the page.
//   - WebSite: on the home page, where Google reads the site's name for search results.
//   - WebApplication: the free online BPM tool, which lives on the home page. The other
//     tool pages build their own from frontmatter (see config.ts).
//   - TechArticle: each guide, with its author and the git date of its last change.
//   - FAQPage: the home page's questions. Google no longer shows FAQ rich results, so
//     this is here for other readers of the markup. Its text must match the page, and a
//     test holds it to docs/index.md, because the two are separate copies.
//
// `sameAs` links resolve the project's identity across GitHub, npm and LinkedIn, so
// search and AI engines treat them as one entity rather than three strings.

const SITE = 'https://www.realtime-bpm-analyzer.com/'

// One person writes, maintains and publishes the site, the tools and the library.
const AUTHOR = {
  '@type': 'Person',
  name: 'David Lepaux',
  url: 'https://david.lepaux.com',
  sameAs: [
    'https://github.com/dlepaux',
    'https://www.npmjs.com/~dlepaux',
    'https://www.linkedin.com/in/david-lepaux',
  ],
}

const SCHEMA_SOFTWARE_SOURCE_CODE = {
  '@type': 'SoftwareSourceCode',
  name: 'Realtime BPM Analyzer',
  description: 'Zero-dependency TypeScript library for detecting beats-per-minute (BPM) of audio or video sources in real time in the browser.',
  url: SITE,
  codeRepository: 'https://github.com/dlepaux/realtime-bpm-analyzer',
  sameAs: [
    'https://www.npmjs.com/package/realtime-bpm-analyzer',
  ],
  programmingLanguage: ['TypeScript', 'JavaScript'],
  runtimePlatform: 'Browser',
  license: 'https://spdx.org/licenses/Apache-2.0',
  author: AUTHOR,
}

const SCHEMA_WEB_SITE = {
  '@type': 'WebSite',
  name: 'Realtime BPM Analyzer',
  url: SITE,
}

export const SCHEMA_WEB_APPLICATION = {
  '@type': 'WebApplication',
  name: 'Realtime BPM Analyzer',
  description: 'Free online BPM finder and detector: find the tempo of any song directly in your browser from a file, your microphone, or a live radio stream. Your audio never leaves your device, and no account is needed.',
  url: SITE,
  applicationCategory: 'MultimediaApplication',
  operatingSystem: 'Web Browser',
  browserRequirements: 'Requires Web Audio API support (any modern browser).',
  inLanguage: 'en',
  isAccessibleForFree: true,
  author: AUTHOR,
  publisher: AUTHOR,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  featureList: [
    'Analyze audio files (MP3, WAV, FLAC, M4A, OGG)',
    'Detect BPM from microphone input',
    'Detect BPM from a live radio stream',
    'Detect BPM from the audio of another browser tab (desktop Chrome and Edge)',
    'Detect BPM from the sound track of a video file',
    'Audio processed locally in the browser, never uploaded',
  ],
}

export const HOME_FAQ = [
  {
    q: 'What is BPM?',
    a: 'BPM stands for beats per minute, the tempo of a piece of music. It is the count of the underlying beats in one minute. A typical house track runs at 120 to 130 BPM, drum and bass at 160 to 180, ambient and downtempo below 100.',
  },
  {
    q: 'How does it work?',
    a: 'The analyzer uses the Web Audio API to decode audio directly in your browser, and measures how the sound changes from moment to moment across several frequency bands. The tempo is the spacing that repeats most in those changes. The analysis happens on your device.',
  },
  {
    q: 'Is my audio sent to a server?',
    a: 'No. Files you drop, microphone input and stream audio are all analysed in your browser by the open-source library, which sends no audio anywhere. Your audio never leaves your device. The website uses Google Analytics to record how the tool is used, such as the tempo found and, for a file, its size, type and duration. It never records the file, its sound or its name.',
  },
  {
    q: 'Which audio formats are supported?',
    a: 'MP3, WAV, FLAC, M4A and OGG, and in general any audio your browser can play, including the sound of a video file. Microphone input and live streams have no format constraint.',
  },
  {
    q: 'Does it work on mobile?',
    a: 'Yes. The tool works on modern mobile browsers (iOS Safari and Android Chrome). Choosing a file, microphone permission and stream playback all work on touch devices.',
  },
  {
    q: 'How accurate is the BPM detection?',
    a: 'It works best on music with a steady beat. Ambient, rubato or beatless tracks are harder and may not produce a confident result. A very fast or very slow track can read at half or double its tempo, so check the number against what you hear.',
  },
  {
    q: 'Can I use this as a library in my own app?',
    a: 'Yes. The analyzer is a zero-dependency TypeScript library published to npm. See the developer docs below.',
  },
] as const

function faqPage(items: readonly { readonly q: string; readonly a: string }[]) {
  return {
    '@type': 'FAQPage',
    mainEntity: items.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  }
}

/** The FAQPage for a tool page's `faq:` frontmatter, which ToolFaq.vue renders visibly. */
export const toolFaqPage = faqPage

const LIBRARY_PAGE = /^(guide|examples|api)\//

/** The schemas a page always carries, by its source path relative to docs/. */
export function siteGraph(relativePath: string): object[] {
  if (relativePath === 'index.md') {
    return [SCHEMA_WEB_SITE, SCHEMA_SOFTWARE_SOURCE_CODE, SCHEMA_WEB_APPLICATION, faqPage(HOME_FAQ)]
  }
  return LIBRARY_PAGE.test(relativePath) ? [SCHEMA_SOFTWARE_SOURCE_CODE] : []
}

/**
 * Guides for packages that aren't on npm yet. Their pages stay at the same URLs but are
 * noindex, out of the sitemap, the sidebar, the search and llms.txt, and nothing links
 * to them (RBA-122). They come back with the v6 release, PR #323.
 */
export const UNPUBLISHED_GUIDES: readonly string[] = ['guide/cli', 'guide/mcp']

/** A page's path without its leading slash, `.md` or `.html`: `guide/cli`. */
function pagePath(urlOrSource: string): string {
  return urlOrSource.replace(/^\//, '').replace(/\.(md|html)$/, '')
}

/** True for a guide whose package isn't published yet, by URL or by source path. */
export function isUnpublishedGuide(urlOrSource: string): boolean {
  return UNPUBLISHED_GUIDES.includes(pagePath(urlOrSource))
}

/**
 * True for a sitemap URL whose page is noindex: docs/readme.md, the docs' own developer
 * notes, published because everything under docs/ is, and the unpublished guides.
 */
export function isNoindexPage(url: string): boolean {
  return pagePath(url) === 'readme' || isUnpublishedGuide(url)
}

/** True for a guide page, which is an article: og:type article and a TechArticle. */
export function isGuidePage(relativePath: string): boolean {
  return relativePath.startsWith('guide/') && !isUnpublishedGuide(relativePath)
}

/** A git timestamp as an ISO date, or undefined when git had none (an uncommitted file). */
export function isoDate(timestamp: number | undefined): string | undefined {
  return timestamp && Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined
}

/**
 * A page's date as readers see it: "November 3, 2026". Formatted in UTC so the server
 * HTML and the browser agree, which lets the date ship in the prerendered page.
 */
export function readableDate(timestamp: number | undefined): string | undefined {
  if (!isoDate(timestamp)) return undefined
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(timestamp)
}

type ArticleFacts = {
  readonly headline: string
  readonly description: string
  readonly url: string
  /** Git timestamps in ms, the same source the sitemap's lastmod uses. */
  readonly modified?: number
  readonly published?: number
}

/** The TechArticle for a guide. Dates git doesn't know are left out, never guessed. */
export function techArticle({ headline, description, url, modified, published }: ArticleFacts) {
  const dateModified = isoDate(modified)
  const datePublished = isoDate(published)
  return {
    '@type': 'TechArticle',
    headline,
    description,
    url,
    mainEntityOfPage: url,
    inLanguage: 'en',
    author: AUTHOR,
    publisher: AUTHOR,
    ...(datePublished === undefined ? {} : { datePublished }),
    ...(dateModified === undefined ? {} : { dateModified }),
  }
}
