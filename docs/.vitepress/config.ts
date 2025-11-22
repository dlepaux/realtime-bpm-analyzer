import { defineConfig } from 'vitepress'

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
  
  // Ignore dead links for pages we haven't created yet
  ignoreDeadLinks: [],
  
  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    ['meta', { name: 'theme-color', content: '#646cff' }],
    ['meta', { name: 'og:type', content: 'website' }],
    ['meta', { name: 'og:locale', content: 'en' }],
    ['meta', { name: 'og:site_name', content: 'Realtime BPM Analyzer' }],
    ['link', { rel: 'icon', type: 'image/png', href: '/favicon-96x96.png', sizes: '96x96' }],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    ['link', { rel: 'shortcut icon', href: '/favicon.ico' }],
    ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }],
    ['meta', { name: 'apple-mobile-web-app-title', content: 'Realtime BPM Analyzer' }],
    ['link', { rel: 'manifest', href: '/site.webmanifest'}],
  ],


  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: '/logo.svg',
    
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Examples', link: '/examples/basic-usage' },
      { text: 'API Reference', link: '/api/' },
      { 
        text: 'v5.0.0',
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
      copyright: 'Copyright © 2025 David Lepaux'
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
