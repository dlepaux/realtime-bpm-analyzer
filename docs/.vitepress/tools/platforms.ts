// Where the library runs, for the home page's "Where it runs" section (RBA-266). Pure and
// import-free so `npm test` reads it with node --test.

export type Platform = {
  readonly name: string
  readonly guide: string
}

export const PLATFORMS: readonly Platform[] = [
  { name: 'Browser', guide: '/guide/getting-started' },
  { name: 'Node.js', guide: '/guide/node' },
  { name: 'Deno', guide: '/guide/node' },
  { name: 'Bun', guide: '/guide/node' },
  { name: 'Python', guide: '/guide/python' },
  { name: 'Java', guide: '/guide/java' },
  { name: 'Kotlin', guide: '/guide/java' },
  { name: 'Android', guide: '/guide/java' },
  { name: 'C#', guide: '/guide/csharp' },
  { name: 'Unity', guide: '/guide/csharp' },
  { name: 'Godot', guide: '/guide/csharp' },
  { name: 'Swift', guide: '/guide/swift' },
  { name: 'iOS', guide: '/guide/swift' },
  { name: 'macOS', guide: '/guide/swift' },
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
  { id: 'csharp', label: 'C#', guide: '/guide/csharp', guideTitle: 'the C# guide', sources: ['csharp.md'] },
  { id: 'swift', label: 'Swift', guide: '/guide/swift', guideTitle: 'the Swift guide', sources: ['swift.md'] },
]
