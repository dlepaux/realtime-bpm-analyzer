import { defineConfig } from 'vitepress'
import { createRequire } from 'module'
import { isUsersOnlyExtensionPage } from './tools/extension-pages'
import { isNoindexPage, SCHEMA_WEB_APPLICATION, siteGraph, toolFaqPage } from './tools/site-schema'
import { STORE_URL } from './tools/extension-live'
import { excludedSources, extensionHomeFeatures, extensionNavItems, extensionPageSchema } from './tools/extension-promo'

const require = createRequire(import.meta.url)
// The library's version, through its workspace link (packages/realtime-bpm-analyzer)
const pkg = require('realtime-bpm-analyzer/package.json')

// ── Build-time GitHub star count fetch ─────────────────────────────────────
// Runs once when `vitepress dev` or `vitepress build` boots. The value is
// baked into the bundle via `vite.define` below — zero runtime API calls,
// no rate-limit exposure for visitors, no flaky network on shared IPs.
//
// Failure handling: any error (offline CI, GitHub down, rate limited, schema
// drift) resolves to `null`. Components MUST treat `null` as "render without
// the count" and never break. Stale count by hours/days is acceptable —
// next deploy re-bakes it.
async function fetchStarCount(): Promise<number | null> {
  try {
    const res = await fetch('https://api.github.com/repos/dlepaux/realtime-bpm-analyzer', {
      headers: { 'Accept': 'application/vnd.github+json' },
      // Don't hang the build forever if GitHub is slow.
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      console.warn(`[star-count] GitHub API returned ${res.status}; rendering without count`)
      return null
    }
    const data = await res.json() as { stargazers_count?: unknown }
    const count = data.stargazers_count
    return typeof count === 'number' ? count : null
  } catch (err) {
    console.warn('[star-count] fetch failed, rendering without count:', err instanceof Error ? err.message : err)
    return null
  }
}

const GITHUB_STAR_COUNT = await fetchStarCount()

// GTM container for analytics. Change here if the container is ever rotated.
const GTM_CONTAINER_ID = 'GTM-WF758H3P'

// Copyright year range — first commit landed in 2015. End year auto-updates
// on every build so deployed docs always show the current year.
const COPYRIGHT_START_YEAR = 2015
const COPYRIGHT_END_YEAR = new Date().getFullYear()
const COPYRIGHT_YEARS = COPYRIGHT_END_YEAR > COPYRIGHT_START_YEAR
  ? `${COPYRIGHT_START_YEAR}–${COPYRIGHT_END_YEAR}`
  : `${COPYRIGHT_START_YEAR}`

const SHARE_IMAGE_ALT = 'The Realtime BPM Analyzer logo and name'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Realtime BPM Analyzer",
  titleTemplate: ":title | Realtime BPM Analyzer",
  description: "Realtime BPM detection library for the browser — file, microphone, and stream audio. AudioWorklet-native, zero dependencies, TypeScript-first. Includes a free online BPM tool.",

  // Base URL - using root since deployed to www.realtime-bpm-analyzer.com
  base: '/',

  // Clean URLs (remove .html extension)
  cleanUrls: true,

  // Last updated timestamp
  lastUpdated: true,

  // Sitemap generation
  sitemap: {
    hostname: 'https://www.realtime-bpm-analyzer.com',
    // The pages the browser extension opens (RBA-38) are for its users only and
    // carry noindex, so they stay out of the sitemap too. The /extension/ page itself
    // goes in once it is built (see srcExclude). A sitemap lists what should appear in
    // results, so a noindex page has no place in it.
    transformItems: (items) => items.filter((item) => !isUsersOnlyExtensionPage(item.url) && !isNoindexPage(item.url)),
  },
  
  // The /extension/ page exists only once the extension has a store listing (RBA-58).
  // Left out of the build, it has no route, no sitemap entry and no search entry.
  srcExclude: excludedSources(STORE_URL),

  // Ignore dead links for pages we haven't created yet
  ignoreDeadLinks: [],

  // Pass-through to the underlying Vite build. We use `define` to bake the
  // build-time star count into the bundle so the GithubStarSupport component
  // can render it as a literal — no runtime fetch, no rate-limit risk.
  vite: {
    define: {
      __GITHUB_STAR_COUNT__: JSON.stringify(GITHUB_STAR_COUNT),
    },
  },

  // Inject the GTM noscript fallback right after <body>
  transformHtml(code) {
    return code.replace(
      /<body([^>]*)>/,
      `<body$1>\n<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${GTM_CONTAINER_ID}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`
    )
  },

  // Per-page canonical + og:url + per-page og/twitter title/description.
  //
  // Canonical: GitHub Pages serves the same file at both `/foo.html` and
  // `/foo`, so without a canonical tag Google treats the two as duplicates
  // and demotes one ("Crawled, currently not indexed" in GSC). The canonical
  // always points to the cleanUrls form on the apex host.
  //
  // OG/Twitter title + description: injected per-page from the page's own
  // frontmatter, falling back to the site-wide defaults below when a page
  // doesn't set them. We deliberately do NOT also emit these from the
  // global `head:` array — OpenGraph crawlers use the first occurrence of
  // a property, so a duplicate would pin every inner page to the home-page
  // value and defeat the per-page descriptions.
  transformPageData(pageData) {
    const slug = pageData.relativePath
      .replace(/(^|\/)index\.md$/, '$1')
      .replace(/\.md$/, '')
    const canonical = `https://www.realtime-bpm-analyzer.com/${slug}`

    const SITE_NAME = 'Realtime BPM Analyzer'
    const DEFAULT_OG_TITLE = 'Realtime BPM Analyzer — Web Audio BPM Detection Library'
    const DEFAULT_DESCRIPTION = 'Realtime BPM detection library for the browser — file, microphone, and stream audio. AudioWorklet-native, zero dependencies, TypeScript-first. Includes a free online BPM tool.'

    const pageTitle = pageData.frontmatter.title as string | undefined
    const pageDesc = pageData.frontmatter.description as string | undefined

    const ogTitle = pageTitle
      ? `${pageTitle} | ${SITE_NAME}`
      : DEFAULT_OG_TITLE
    const ogDesc = pageDesc ?? DEFAULT_DESCRIPTION

    // Schema.org @graph, one <script> tag per page: see tools/site-schema.ts for what
    // goes where. Google reads @graph members independently.
    const isHome = pageData.relativePath === 'index.md'
    const graph: object[] = siteGraph(pageData.relativePath)

    // Tool pages (tap tempo, BPM to ms, metronome) describe themselves in
    // frontmatter: `tool:` becomes their WebApplication and `faq:` their
    // FAQPage. ToolFaq.vue renders the same `faq:` list on the page, which is
    // what keeps the markup valid: Google requires the answers to be visible.
    const tool = pageData.frontmatter.tool as { name: string; featureList: string[] } | undefined
    const faq = pageData.frontmatter.faq as { q: string; a: string }[] | undefined
    if (tool) {
      graph.push({
        ...SCHEMA_WEB_APPLICATION,
        name: tool.name,
        description: ogDesc,
        url: canonical,
        featureList: tool.featureList,
      })
    }
    if (faq?.length) graph.push(toolFaqPage(faq))

    if (STORE_URL && pageData.relativePath === 'extension/index.md') {
      graph.push(extensionPageSchema(STORE_URL, canonical, ogDesc))
    }
    if (isHome) {
      pageData.frontmatter.features = [
        ...(pageData.frontmatter.features as object[]),
        ...extensionHomeFeatures(STORE_URL),
      ]
    }

    pageData.frontmatter.head ??= []
    pageData.frontmatter.head.push(
      ['link', { rel: 'canonical', href: canonical }],
      ['meta', { property: 'og:url', content: canonical }],
      ['meta', { property: 'og:title', content: ogTitle }],
      ['meta', { property: 'og:description', content: ogDesc }],
      ['meta', { name: 'twitter:title', content: ogTitle }],
      ['meta', { name: 'twitter:description', content: ogDesc }],
      ['script', { type: 'application/ld+json' }, JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': graph,
      })],
    )
  },
  
  head: [
    // Warm the connection to GTM before its loader script fires — saves the
    // DNS + TLS round-trip on first paint. Paired with the GTM snippet below.
    ['link', { rel: 'preconnect', href: 'https://www.googletagmanager.com', crossorigin: '' }],
    // LCP candidate — the home hero image. Tells the preload scanner to start
    // fetching before VitePress's CSS finishes parsing.
    ['link', { rel: 'preload', as: 'image', href: '/logo.svg', type: 'image/svg+xml' }],
    // Google Tag Manager — container loads GA4 + any future tags from the GTM dashboard.
    // GA4 measurement ID G-S911G9WQTM must be configured as a tag inside GTM.
    ['script', {}, `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_CONTAINER_ID}');`],
    ['meta', { name: 'theme-color', content: '#646cff' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:locale', content: 'en_US' }],
    ['meta', { property: 'og:site_name', content: 'Realtime BPM Analyzer' }],
    // og:url, og:title, og:description, twitter:title, twitter:description
    // are injected per-page via transformPageData so each URL is
    // self-canonical and each page surfaces its own meta.
    ['meta', { property: 'og:image', content: 'https://www.realtime-bpm-analyzer.com/realtime-bpm-analyzer-share.png' }],
    ['meta', { property: 'og:image:width', content: '1280' }],
    ['meta', { property: 'og:image:height', content: '640' }],
    ['meta', { property: 'og:image:alt', content: SHARE_IMAGE_ALT }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: 'https://www.realtime-bpm-analyzer.com/realtime-bpm-analyzer-share.png' }],
    ['meta', { name: 'twitter:image:alt', content: SHARE_IMAGE_ALT }],
    ['link', { rel: 'icon', type: 'image/png', href: '/favicon/favicon-96x96.png', sizes: '96x96' }],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon/favicon.svg' }],
    ['link', { rel: 'shortcut icon', href: '/favicon/favicon.ico' }],
    ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: '/favicon/apple-touch-icon.png' }],
    ['meta', { name: 'apple-mobile-web-app-title', content: 'Realtime BPM Analyzer' }],
    ['link', { rel: 'manifest', href: '/favicon/site.webmanifest'}],
    // Structured data is injected per-page from transformPageData: see tools/site-schema.ts.
  ],


  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: '/logo.svg',
    
    nav: [
      {
        text: 'Free Tools',
        items: [
          { text: 'BPM Analyzer', link: '/' },
          { text: 'Tap Tempo', link: '/tap-tempo' },
          { text: 'BPM to ms Calculator', link: '/bpm-to-ms' },
          { text: 'Metronome', link: '/metronome' },
        ],
      },
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Examples', link: '/examples/basic-usage' },
      { text: 'API Reference', link: '/api/' },
      ...extensionNavItems(STORE_URL),
      { 
        text: `v${pkg.version}`,
        items: [
          { text: 'Changelog', link: 'https://github.com/dlepaux/realtime-bpm-analyzer/blob/main/packages/realtime-bpm-analyzer/changelog.md' },
          { text: 'Contributing', link: '/contributing' },
          { text: 'Code of Conduct', link: '/code-of-conduct' },
          { text: 'Security', link: '/security' },
          { text: 'Library Privacy', link: '/privacy' },
          { text: 'Website Privacy', link: '/website-privacy' },
          { text: 'Extension Privacy', link: '/extension/privacy' }
        ]
      }
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is Realtime BPM Analyzer?', link: '/guide/introduction' },
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Core Concepts', link: '/guide/core-concepts' }
          ]
        },
        {
          text: 'Tutorials',
          items: [
            { text: 'Realtime BPM Detection in the Browser', link: '/guide/realtime-bpm-detection' },
            { text: 'Detect BPM from a Microphone', link: '/guide/bpm-from-microphone' },
            { text: 'useBpm — A React Hook for BPM Detection', link: '/guide/react-bpm-hook' }
          ]
        },
        {
          text: 'Advanced',
          items: [
            { text: 'How It Works', link: '/guide/how-it-works' },
            { text: 'Performance Tips', link: '/guide/performance' },
            { text: 'Browser Compatibility', link: '/guide/browser-compatibility' },
            { text: 'Strict CSP and Browser Extensions', link: '/guide/strict-csp' },
            { text: 'BPM Detection in Node.js', link: '/guide/node' },
            { text: 'BPM Detection from the Command Line', link: '/guide/cli' },
            { text: 'BPM Detection for AI Assistants (MCP)', link: '/guide/mcp' },
            { text: 'Migration Guide (v4 → v5)', link: '/guide/migration-v5' }
          ]
        }
      ],
      '/examples/': [
        {
          text: 'Examples',
          items: [
            { text: 'Basic Usage', link: '/examples/basic-usage' },
            { text: 'Streaming Audio', link: '/examples/streaming-audio' },
            { text: 'Microphone Input', link: '/examples/microphone-input' }
          ]
        },
        {
          text: 'Framework Integration',
          items: [
            { text: 'React', link: '/examples/react' },
            { text: 'Vue', link: '/examples/vue' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/dlepaux/realtime-bpm-analyzer' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/realtime-bpm-analyzer' }
    ],

    footer: {
      message: 'Released under the Apache License 2.0 · <a href="/website-privacy">Website privacy</a>',
      copyright: `Copyright © ${COPYRIGHT_YEARS} <a href="https://david.lepaux.com">David Lepaux</a>`,
    },

    search: {
      provider: 'local'
    },

    editLink: {
      pattern: 'https://github.com/dlepaux/realtime-bpm-analyzer/edit/main/docs/:path',
      text: 'Edit this page on GitHub'
    }
  }
})
