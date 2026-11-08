import DefaultTheme from 'vitepress/theme'
import type { EnhanceAppContext, Theme } from 'vitepress'
import ExampleEmbed from '../components/ExampleEmbed.vue'
import Layout from './Layout.vue'
import './tokens.css'
import './custom.css'
import './home.css'
import './tools.css'
import './extension.css'
import './extension-scenes.css'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }: EnhanceAppContext) {
    app.component('ExampleEmbed', ExampleEmbed)
  },
} satisfies Theme
