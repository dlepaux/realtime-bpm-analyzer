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
