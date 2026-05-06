import { defineConfig } from 'vitepress'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const pkg = require('../../package.json')

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
  },
  
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

  // Per-page canonical + og:url. GitHub Pages serves the same file at both
  // `/foo.html` and `/foo`, so without a canonical tag Google treats the two as
  // duplicates and demotes one ("Crawled, currently not indexed" in GSC). The
  // canonical always points to the cleanUrls form on the apex host.
  transformPageData(pageData) {
    const slug = pageData.relativePath
      .replace(/(^|\/)index\.md$/, '$1')
      .replace(/\.md$/, '')
    const canonical = `https://www.realtime-bpm-analyzer.com/${slug}`
    pageData.frontmatter.head ??= []
    pageData.frontmatter.head.push(
      ['link', { rel: 'canonical', href: canonical }],
      ['meta', { property: 'og:url', content: canonical }],
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
    ['meta', { property: 'og:locale', content: 'en' }],
    ['meta', { property: 'og:site_name', content: 'Realtime BPM Analyzer' }],
    ['meta', { property: 'og:title', content: 'Realtime BPM Analyzer — Web Audio BPM Detection Library' }],
    ['meta', { property: 'og:description', content: 'Realtime BPM detection library for the browser — file, microphone, and stream audio. AudioWorklet-native, zero dependencies, TypeScript-first. Includes a free online BPM tool.' }],
    // og:url is injected per-page via transformPageData so each URL is self-canonical.
    ['meta', { property: 'og:image', content: 'https://www.realtime-bpm-analyzer.com/realtime-bpm-analyzer-share.png' }],
    ['meta', { property: 'og:image:width', content: '1280' }],
    ['meta', { property: 'og:image:height', content: '640' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'Realtime BPM Analyzer — Web Audio BPM Detection Library' }],
    ['meta', { name: 'twitter:description', content: 'Realtime BPM detection library for the browser — file, microphone, and stream audio. AudioWorklet-native, zero dependencies, TypeScript-first.' }],
    ['meta', { name: 'twitter:image', content: 'https://www.realtime-bpm-analyzer.com/realtime-bpm-analyzer-share.png' }],
    ['link', { rel: 'icon', type: 'image/png', href: '/favicon/favicon-96x96.png', sizes: '96x96' }],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon/favicon.svg' }],
    ['link', { rel: 'shortcut icon', href: '/favicon/favicon.ico' }],
    ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: '/favicon/apple-touch-icon.png' }],
    ['meta', { name: 'apple-mobile-web-app-title', content: 'Realtime BPM Analyzer' }],
    ['link', { rel: 'manifest', href: '/favicon/site.webmanifest'}],
    // Structured data — three schemas merged into a single @graph block:
    //   - SoftwareSourceCode: the library (developer search)
    //   - WebApplication:    the consumer tool ("bpm analyzer" search)
    //   - FAQPage:           rich-result eligibility for the FAQ section
    // One <script> tag instead of three — fewer parser pauses, smaller HTML,
    // identical SEO surface for Google/Bing crawlers.
    ['script', { type: 'application/ld+json' }, JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'SoftwareSourceCode',
          name: 'Realtime BPM Analyzer',
          description: 'Zero-dependency TypeScript library for detecting beats-per-minute (BPM) of audio or video sources in real time in the browser.',
          url: 'https://www.realtime-bpm-analyzer.com',
          codeRepository: 'https://github.com/dlepaux/realtime-bpm-analyzer',
          programmingLanguage: ['TypeScript', 'JavaScript'],
          runtimePlatform: 'Browser',
          license: 'https://spdx.org/licenses/Apache-2.0',
          author: {
            '@type': 'Person',
            name: 'David Lepaux',
            url: 'https://david.lepaux.com',
          },
        },
        {
          '@type': 'WebApplication',
          name: 'Realtime BPM Analyzer',
          description: 'Free online BPM analyzer — find the tempo of any song directly in your browser from a file, your microphone, or a live radio stream. No upload, no account.',
          url: 'https://www.realtime-bpm-analyzer.com',
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
            'Analyze audio files (MP3, WAV, FLAC)',
            'Detect BPM from microphone input',
            'Detect BPM from a live radio stream',
            'Audio processed locally in the browser — never uploaded',
          ],
        },
        {
          '@type': 'FAQPage',
          mainEntity: [
            {
              '@type': 'Question',
              name: 'What is BPM?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: 'BPM stands for beats per minute — the tempo of a piece of music. It is the count of the underlying beats in one minute. A typical house track runs at 120–130 BPM, drum and bass at 160–180, ambient and downtempo below 100.',
              },
            },
            {
              '@type': 'Question',
              name: 'How does the BPM analyzer work?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: 'The analyzer uses the Web Audio API to decode audio directly in your browser, applies a low-pass filter to isolate the low-frequency transients that usually carry the beat, and counts the intervals between detected peaks. The most frequent interval gives the BPM.',
              },
            },
            {
              '@type': 'Question',
              name: 'Is my audio sent to a server?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: 'No. Files you drop, microphone input, and stream audio are all processed locally in your browser. Nothing is uploaded. The site is pure client-side JavaScript.',
              },
            },
            {
              '@type': 'Question',
              name: 'Which audio formats are supported?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: 'MP3, WAV, and FLAC are supported for file analysis. Microphone input and live streams are handled directly via the Web Audio API without a format constraint.',
              },
            },
            {
              '@type': 'Question',
              name: 'Does it work on mobile?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: 'Yes. The tool works on modern mobile browsers (iOS Safari and Android Chrome). File upload, microphone permission, and stream playback all function on touch devices.',
              },
            },
            {
              '@type': 'Question',
              name: 'How accurate is the BPM detection?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: 'For most modern music with a steady beat, detection is accurate within 1–2 BPM. Ambient, rubato, or beatless tracks are harder and may not produce a confident result. The analyzer always returns the top candidates so you can compare.',
              },
            },
            {
              '@type': 'Question',
              name: 'Can I use this as a library in my own app?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: 'Yes. Install realtime-bpm-analyzer from npm. It is zero-dependency, written in TypeScript, and works with vanilla JS, React, Vue, or any modern framework. See the developer docs for integration examples.',
              },
            },
          ],
        },
      ],
    })],
  ],


  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: '/logo.svg',
    
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Examples', link: '/examples/basic-usage' },
      { text: 'API Reference', link: '/api/' },
      { 
        text: `v${pkg.version}`,
        items: [
          { text: 'Changelog', link: 'https://github.com/dlepaux/realtime-bpm-analyzer/blob/main/changelog.md' },
          { text: 'Contributing', link: '/contributing' },
          { text: 'Code of Conduct', link: '/code-of-conduct' },
          { text: 'Security', link: '/security' },
          { text: 'Privacy', link: '/privacy' }
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
            { text: 'Browser Compatibility', link: '/guide/browser-compatibility' }
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
      message: 'Released under the Apache License 2.0',
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
