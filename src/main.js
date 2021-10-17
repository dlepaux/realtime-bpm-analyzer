import {createApp} from 'vue';
import {createRouter, createWebHistory} from 'vue-router';

/**
 * Components
 */
import App from './app.vue';
import Home from './views/routes/home.vue';
import AudioNode from './views/routes/audio-node.vue';
import HowItWorks from './views/routes/how-it-works.vue';
import UserMedia from './views/routes/user-media.vue';

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
  history: createWebHistory(),
  routes,
});

/**
 * Create vue app
 */
const app = createApp(App);
app.use(router);
app.mount('#root');
