import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Realtime BPM Analyzer",
  description: "A powerful TypeScript/JavaScript library for detecting the beats-per-minute (BPM) of audio or video sources in real-time",
  
  // Base URL for GitHub Pages (will be /realtime-bpm-analyzer/)
  base: '/realtime-bpm-analyzer/',
  
  // Clean URLs (remove .html extension)
  cleanUrls: true,
  
  // Last updated timestamp
  lastUpdated: true,
  
  // Ignore dead links for pages we haven't created yet
  ignoreDeadLinks: [
    /\/guide\/player-strategy/,
    /\/guide\/continuous-analysis/,
    /\/guide\/offline-analysis/,
    /\/examples\/microphone-input/,
    /\/examples\/file-upload/,
    /\/examples\/streaming-audio/,
    /\/examples\/nextjs/,
    /\/examples\/react/,
    /\/examples\/vue/,
  ],
  
  head: [
    ['link', { rel: 'icon', href: '/realtime-bpm-analyzer/favicon.ico' }],
    ['meta', { name: 'theme-color', content: '#646cff' }],
    ['meta', { name: 'og:type', content: 'website' }],
    ['meta', { name: 'og:locale', content: 'en' }],
    ['meta', { name: 'og:site_name', content: 'Realtime BPM Analyzer' }],
  ],


  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: '/logo.svg',
    
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Examples', link: '/examples/basic-usage' },
      { text: 'API Reference', link: '/api/' },
      { 
        text: 'v4.0.2',
        items: [
          { text: 'Changelog', link: 'https://github.com/dlepaux/realtime-bpm-analyzer/blob/main/changelog.md' },
          { text: 'Contributing', link: '/contributing' }
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
          text: 'Usage Strategies',
          items: [
            { text: 'Player Strategy', link: '/guide/player-strategy' },
            { text: 'Continuous Analysis', link: '/guide/continuous-analysis' },
            { text: 'Offline Analysis', link: '/guide/offline-analysis' }
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
            { text: 'Microphone Input', link: '/examples/microphone-input' },
            { text: 'File Upload', link: '/examples/file-upload' },
            { text: 'Streaming Audio', link: '/examples/streaming-audio' }
          ]
        },
        {
          text: 'Framework Integration',
          items: [
            { text: 'Next.js', link: '/examples/nextjs' },
            { text: 'React', link: '/examples/react' },
            { text: 'Vue', link: '/examples/vue' },
            { text: 'Vanilla JavaScript', link: '/examples/vanilla-js' }
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
