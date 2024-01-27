import {esbuildPlugin} from '@web/dev-server-esbuild';
import {chromeLauncher} from '@web/test-runner-chrome';

export default {
  files: ['tests/**/*.ts'],
  browsers: [
    chromeLauncher({
      launchOptions: {
        headless: false,
        devtools: true,
        args: [
          '--autoplay-policy=no-user-gesture-required',
          '--disable-web-security',
          // '--no-user-gesture-required',
          // '--autoplay-policy=no-user-gesture-required',
          // '--disable-web-security',
        ],
      },
    }),
  ],
  plugins: [esbuildPlugin({
    ts: true,
  })],
};
