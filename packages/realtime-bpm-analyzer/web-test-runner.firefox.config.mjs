import {puppeteerLauncher} from '@web/test-runner-puppeteer';
import base from './web-test-runner.config.mjs';

/**
 * The same tests in Firefox, through puppeteer's WebDriver BiDi support: Gecko reads the audio clock differently
 * from Chromium (the main thread's currentTime freezes during a long task), and the epoch watchdog depends on it.
 * Coverage stays with the Chromium run: it is read through the DevTools protocol, which Firefox does not speak.
 */
export default {
  ...base,
  coverage: false,
  // One file at a time: run in parallel, a file that starts worklets hung its Firefox page now and then, with no
  // test failing (create-processor, then error-handling, in RBA-108's CI runs)
  concurrency: 1,
  browsers: [
    puppeteerLauncher({
      launchOptions: {
        browser: 'firefox',
        headless: true,
        extraPrefsFirefox: {
          // Tests start audio graphs without a user gesture
          'media.autoplay.default': 0,
          'media.autoplay.block-webaudio': false,
          // Never let a test play through the speakers
          'media.volume_scale': '0.0',
        },
      },
    }),
  ],
};
