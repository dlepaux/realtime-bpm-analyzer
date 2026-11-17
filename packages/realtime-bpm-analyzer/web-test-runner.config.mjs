import {esbuildPlugin} from '@web/dev-server-esbuild';
import {puppeteerLauncher} from '@web/test-runner-puppeteer';

export default {
  files: ['tests/**/*.ts'],
  nodeResolve: true,
  browserLogs: true,
  // A CI run reached 28 s of this, on a busy runner
  testsFinishTimeout: 60000,
  // Tempogram tests run minutes of audio offline and passed 2 s only on a quiet runner: two of them
  // timed out on one PR, on code that had not changed
  testFramework: {config: {timeout: 10000}},
  browsers: [
    puppeteerLauncher({
      // A window per test file, not a tab: files run side by side, and every tab but the newest is hidden. Chromium
      // does not load media in a hidden page, so a media element's play() never settled there (RBA-243: readyState
      // 0 in CI, and the same hang in Chrome 157 on a Mac with the page in a background tab, none when in front)
      createPage: ({browser}) => browser.newPage({type: 'window'}),
      launchOptions: {
        headless: 'new',
        devtools: false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--autoplay-policy=no-user-gesture-required',
          // Tests start real audio graphs: never let them play through the speakers
          '--mute-audio',
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
