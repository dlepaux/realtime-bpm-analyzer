import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import ExampleEmbed from '../components/ExampleEmbed.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }: { app: any }) {
    // Register ExampleEmbed component globally
    app.component('ExampleEmbed', ExampleEmbed)
  }
} satisfies Theme
