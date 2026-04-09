import { defineConfig } from 'vitepress'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const pkg = require('../../package.json')

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Realtime BPM Analyzer",
  description: "A powerful TypeScript/JavaScript library for detecting the beats-per-minute (BPM) of audio or video sources in real-time",

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
  
  head: [
    ['script', { async: '', src: 'https://www.googletagmanager.com/gtag/js?id=G-S911G9WQTM' }],
    ['script', {}, `window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', 'G-S911G9WQTM');`],
    ['meta', { name: 'theme-color', content: '#646cff' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:locale', content: 'en' }],
    ['meta', { property: 'og:site_name', content: 'Realtime BPM Analyzer' }],
    ['meta', { property: 'og:title', content: 'Realtime BPM Analyzer' }],
    ['meta', { property: 'og:description', content: 'A powerful TypeScript/JavaScript library for detecting the beats-per-minute (BPM) of audio or video sources in real-time' }],
    ['meta', { property: 'og:url', content: 'https://www.realtime-bpm-analyzer.com' }],
    ['meta', { property: 'og:image', content: 'https://www.realtime-bpm-analyzer.com/realtime-bpm-analyzer-share.png' }],
    ['meta', { property: 'og:image:width', content: '1280' }],
    ['meta', { property: 'og:image:height', content: '640' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: 'https://www.realtime-bpm-analyzer.com/realtime-bpm-analyzer-share.png' }],
    ['link', { rel: 'icon', type: 'image/png', href: '/favicon/favicon-96x96.png', sizes: '96x96' }],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon/favicon.svg' }],
    ['link', { rel: 'shortcut icon', href: '/favicon/favicon.ico' }],
    ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: '/favicon/apple-touch-icon.png' }],
    ['meta', { name: 'apple-mobile-web-app-title', content: 'Realtime BPM Analyzer' }],
    ['link', { rel: 'manifest', href: '/favicon/site.webmanifest'}],
    ['script', { type: 'application/ld+json' }, JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SoftwareSourceCode',
      name: 'Realtime BPM Analyzer',
      description: 'A powerful TypeScript/JavaScript library for detecting the beats-per-minute (BPM) of audio or video sources in real-time',
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
      copyright: 'Copyright © 2025 <a href="https://david.lepaux.com">David Lepaux</a>'
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
