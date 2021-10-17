import {createApp} from 'vue';
import {createRouter, createWebHashHistory} from 'vue-router';

/**
 * Bootstrap
 */
import 'bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';

/**
 * Highlight
 */
import hljs from 'highlight.js/lib/core.js';
import javascript from 'highlight.js/lib/languages/javascript.js';
import bash from 'highlight.js/lib/languages/bash.js';
import xml from 'highlight.js/lib/languages/xml.js';
import hljsVuePlugin from '@highlightjs/vue-plugin';
import 'highlight.js/styles/github.css';

/**
 * Components
 */
import App from './app.vue';
import Home from './views/routes/home.vue';
import AudioNode from './views/routes/audio-node.vue';
import HowItWorks from './views/routes/how-it-works.vue';
import UserMedia from './views/routes/user-media.vue';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('xml', xml);

/**
 * Routes
 */
const routes = [
  {path: '/', component: Home},
  {path: '/audio-node', component: AudioNode},
  {path: '/how-it-works', component: HowItWorks},
  {path: '/user-media', component: UserMedia},
];

/**
 * Router
 */
const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

/**
 * Create vue app
 */
const app = createApp(App);
app.use(hljsVuePlugin);
app.use(router);
app.mount('#root');
