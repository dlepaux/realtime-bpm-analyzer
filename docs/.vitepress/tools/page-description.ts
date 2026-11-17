// The meta description of a page that has no `description:` in its frontmatter (RBA-268).
// Two kinds of page can't carry one: the API reference, which TypeDoc writes on every
// build, and the root files `copy:markdown` copies in (privacy, security, contributing,
// code of conduct). Without this they all fell back to the home's description, so
// search showed the same snippet for 40-odd pages. Every other page sets its own.

/** The copied root files, by their path in docs/, each with what it is about. */
const COPIED_PAGES: Readonly<Record<string, string>> = {
  'privacy.md': 'What the realtime-bpm-analyzer library, its CLI and its MCP server do with your audio: they process it on your device, make no network call of their own and collect nothing.',
  'security.md': 'How to report a security issue in realtime-bpm-analyzer, its CLI or its MCP server, and which versions get security fixes.',
  'contributing.md': 'How to contribute to realtime-bpm-analyzer: set up the repository, run the tests and open a pull request.',
  'code-of-conduct.md': 'The code of conduct for everyone who takes part in the realtime-bpm-analyzer project, and how to report a breach of it.',
}

const API_INDEX = 'API reference of realtime-bpm-analyzer: every function, type and event of the library, generated from its TypeScript source.'

/**
 * The description for a page whose frontmatter has none, or undefined to keep the site's
 * default. `title` is the page's own title, the H1 TypeDoc writes ("Function: analyzeFullBuffer()").
 */
export function fallbackDescription(relativePath: string, title: string): string | undefined {
  const copied = COPIED_PAGES[relativePath]
  if (copied) return copied
  if (relativePath === 'api/index.md') return API_INDEX
  if (relativePath.startsWith('api/') && title.trim()) {
    return `${title.trim()}, in the API reference of realtime-bpm-analyzer, generated from its TypeScript source.`
  }
  return undefined
}
