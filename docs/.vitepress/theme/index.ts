import DefaultTheme from 'vitepress/theme'
import type { EnhanceAppContext, Theme } from 'vitepress'
import ExampleEmbed from '../components/ExampleEmbed.vue'
import Layout from './Layout.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }: EnhanceAppContext) {
    app.component('ExampleEmbed', ExampleEmbed)
  },
} satisfies Theme
