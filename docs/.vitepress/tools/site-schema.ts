// The site's schema.org data, and which page gets which. Pure and import-free so
// `npm test` runs it with node --test.
//
//   - SoftwareSourceCode: the open-source library, on the pages about it. It isn't what
//     Tap Tempo or a legal page describes, and Google asks that markup represent the page.
//   - WebSite: on the home page, where Google reads the site's name for search results.
//   - WebApplication: the free online BPM tool, which lives on the home page. The other
//     tool pages build their own from frontmatter (see config.ts).
//   - FAQPage: the home page's questions. Google no longer shows FAQ rich results, so
//     this is here for other readers of the markup. Its text must match the page, and a
//     test holds it to docs/index.md, because the two are separate copies.
//
// `sameAs` links resolve the project's identity across GitHub, npm and LinkedIn, so
// search and AI engines treat them as one entity rather than three strings.

const SITE = 'https://www.realtime-bpm-analyzer.com/'

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
  author: {
    '@type': 'Person',
    name: 'David Lepaux',
    url: 'https://david.lepaux.com',
    sameAs: [
      'https://github.com/dlepaux',
      'https://www.npmjs.com/~dlepaux',
      'https://www.linkedin.com/in/david-lepaux',
    ],
  },
}

const SCHEMA_WEB_SITE = {
  '@type': 'WebSite',
  name: 'Realtime BPM Analyzer',
  url: SITE,
}

export const SCHEMA_WEB_APPLICATION = {
  '@type': 'WebApplication',
  name: 'Realtime BPM Analyzer',
  description: 'Free online BPM analyzer: find the tempo of any song directly in your browser from a file, your microphone, or a live radio stream. Your audio never leaves your device, and no account is needed.',
  url: SITE,
  applicationCategory: 'MultimediaApplication',
  operatingSystem: 'Web Browser',
  browserRequirements: 'Requires Web Audio API support (any modern browser).',
  inLanguage: 'en',
  isAccessibleForFree: true,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  featureList: [
    'Analyze audio files (MP3, WAV, FLAC, M4A, OGG)',
    'Detect BPM from microphone input',
    'Detect BPM from a live radio stream',
    'Audio processed locally in the browser — never uploaded',
  ],
}

export const HOME_FAQ = [
  {
    q: 'What is BPM?',
    a: 'BPM stands for beats per minute — the tempo of a piece of music. It is the count of the underlying beats in one minute. A typical house track runs at 120–130 BPM, drum and bass at 160–180, ambient and downtempo below 100.',
  },
  {
    q: 'How does it work?',
    a: 'The analyzer uses the Web Audio API to decode audio directly in your browser, applies a low-pass filter to isolate the low-frequency transients that usually carry the beat, and counts the intervals between detected peaks. The most frequent interval gives the BPM. Everything happens on your device.',
  },
  {
    q: 'Is my audio sent to a server?',
    a: 'No. Files you drop, microphone input and stream audio are all analysed in your browser by the open-source library, which sends nothing anywhere. Your audio never leaves your device.',
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
 * True for a sitemap URL whose page is noindex. Only docs/readme.md today: it is the
 * docs' own developer notes, published because everything under docs/ is.
 */
export function isNoindexPage(url: string): boolean {
  return /^\/?readme(\.html)?$/.test(url)
}
