// Where the library runs, for the home page's "Where it runs" section (RBA-266). Pure and
// import-free so `npm test` reads it with node --test.
//
// A platform shows a logo only where its owner's terms allow a grey one (see the asset
// comments in HomePlatforms.vue). Node.js (OpenJS Foundation: no colour variations, no logo
// on a site that promotes a product without written permission), Bun ("don't recolour
// without asking"), Python (the PSF asks permission for any colour change) and Kotlin (its
// logo is for official or pre-approved uses only) show their name alone.

export type PlatformLogo = 'browser' | 'deno' | 'duke' | 'android'

export type Platform = {
  readonly name: string
  readonly guide: string
  readonly logo?: PlatformLogo
}

export const PLATFORMS: readonly Platform[] = [
  { name: 'Browser', guide: '/guide/getting-started', logo: 'browser' },
  { name: 'Node.js', guide: '/guide/node' },
  { name: 'Deno', guide: '/guide/node', logo: 'deno' },
  { name: 'Bun', guide: '/guide/node' },
  { name: 'Python', guide: '/guide/python' },
  { name: 'Java', guide: '/guide/java', logo: 'duke' },
  { name: 'Kotlin', guide: '/guide/java' },
  { name: 'Android', guide: '/guide/java', logo: 'android' },
]

export type LanguageTab = {
  /** The name of the slot index.md fills with the tab's install line and sample */
  readonly id: string
  readonly label: string
  readonly guide: string
  readonly guideTitle: string
  /**
   * The guides, under docs/guide, its code blocks are copied from. The tab shows no code of
   * its own: scripts/home-platforms.test.ts finds every block of the tab in one of these.
   */
  readonly sources: readonly string[]
}

export const LANGUAGE_TABS: readonly LanguageTab[] = [
  {
    id: 'javascript',
    label: 'JavaScript',
    guide: '/guide/getting-started',
    guideTitle: 'the getting started guide',
    sources: ['getting-started.md', 'core-concepts.md', 'realtime-bpm-detection.md'],
  },
  { id: 'node', label: 'Node', guide: '/guide/node', guideTitle: 'the Node.js guide', sources: ['getting-started.md', 'node.md'] },
  { id: 'python', label: 'Python', guide: '/guide/python', guideTitle: 'the Python guide', sources: ['python.md'] },
  { id: 'java', label: 'Java', guide: '/guide/java', guideTitle: 'the Java guide', sources: ['java.md'] },
  { id: 'kotlin', label: 'Kotlin', guide: '/guide/java#from-kotlin', guideTitle: 'the Kotlin section of the Java guide', sources: ['java.md'] },
]
