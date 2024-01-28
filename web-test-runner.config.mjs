import {esbuildPlugin} from '@web/dev-server-esbuild';
import {puppeteerLauncher} from '@web/test-runner-puppeteer';

export default {
  files: ['tests/**/*.ts'],
  browsers: [
    puppeteerLauncher({
      launchOptions: {
        headless: false,
        devtools: true,
        args: [
          '--autoplay-policy=no-user-gesture-required',
        ],
      },
    }),
  ],
  plugins: [esbuildPlugin({
    ts: true,
  })],
};
