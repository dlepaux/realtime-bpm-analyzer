import DefaultTheme from 'vitepress/theme'
import { inBrowser, type EnhanceAppContext, type Theme } from 'vitepress'
import { trackRouteChange } from '../composables/useAnalytics'
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
  enhanceApp({ app, router }: EnhanceAppContext) {
    app.component('ExampleEmbed', ExampleEmbed)
    // In-site page views come from the router, not from GA4's history tracking (RBA-154).
    if (inBrowser) router.onAfterRouteChange = trackRouteChange
  },
} satisfies Theme
