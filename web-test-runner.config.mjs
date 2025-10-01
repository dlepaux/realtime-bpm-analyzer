import {esbuildPlugin} from '@web/dev-server-esbuild';
import {puppeteerLauncher} from '@web/test-runner-puppeteer';

export default {
  files: ['tests/**/*.ts'],
  nodeResolve: true,
  browsers: [
    puppeteerLauncher({
      launchOptions: {
        headless: 'new',
        devtools: false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--autoplay-policy=no-user-gesture-required',
        ],
      },
    }),
  ],
  coverage: true,
  coverageConfig: {
    report: true,
    reportDir: 'coverage',
    threshold: {
      statements: 70,
      branches: 70,
      functions: 70,
      lines: 70,
    },
  },
  plugins: [esbuildPlugin({
    ts: true,
  })],
};
