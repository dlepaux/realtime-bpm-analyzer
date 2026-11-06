// The site's top navigation (RBA-66), musician-first: visitors come for the tools, so the
// tools and the extension lead, and the library's pages share one Developers menu. VitePress
// renders this one list on the desktop bar and in the mobile menu. Only menus moved here:
// every link is an address the site already had (RBA-66's DECISION, 2026-11-05).
//
// The CLI, MCP and "Migrating to v6" entries join Developers on the v6 branch, once their
// packages are on npm (RBA-122). Until then those guides are noindex and unlinked.
import type { DefaultTheme } from 'vitepress'
import { extensionNavItems, extensionPrivacyNavItems } from './extension-promo.ts'

const CHANGELOG = 'https://github.com/dlepaux/realtime-bpm-analyzer/blob/main/packages/realtime-bpm-analyzer/changelog.md'

const FREE_TOOLS: DefaultTheme.NavItemWithChildren = {
  text: 'Free Tools',
  items: [
    { text: 'BPM Analyzer', link: '/' },
    { text: 'Tap Tempo', link: '/tap-tempo' },
    { text: 'BPM to ms Calculator', link: '/bpm-to-ms' },
    { text: 'Video BPM Finder', link: '/video-bpm' },
    { text: 'BPM to Frames Calculator', link: '/bpm-to-frames' },
    { text: 'Metronome', link: '/metronome' },
  ],
}

/** The library's menu. The version heads the changelog, where it is what a reader compares. */
function developersMenu(version: string): DefaultTheme.NavItemWithChildren {
  return {
    text: 'Developers',
    // Tested against the page's path, so the menu lights up anywhere in the library's docs.
    activeMatch: '^/(guide|api|examples)/',
    items: [
      { text: 'Library guide', link: '/guide/getting-started' },
      { text: 'Examples', link: '/examples/basic-usage' },
      { text: 'API reference', link: '/api/' },
      { text: `v${version}`, items: [{ text: 'Changelog', link: CHANGELOG }] },
    ],
  }
}

function aboutMenu(storeUrl: string | null): DefaultTheme.NavItemWithChildren {
  return {
    text: 'About',
    items: [
      { text: 'Website privacy', link: '/website-privacy' },
      ...extensionPrivacyNavItems(storeUrl),
      { text: 'Library privacy', link: '/privacy' },
      { text: 'Security', link: '/security' },
      { text: 'Contributing', link: '/contributing' },
      { text: 'Code of Conduct', link: '/code-of-conduct' },
    ],
  }
}

/** The nav for this build: `storeUrl` is the extension switch, `version` the library's. */
export function siteNav(storeUrl: string | null, version: string): DefaultTheme.NavItem[] {
  return [FREE_TOOLS, ...extensionNavItems(storeUrl), developersMenu(version), aboutMenu(storeUrl)]
}
