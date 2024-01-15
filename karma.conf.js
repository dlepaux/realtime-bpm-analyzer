// Karma configuration
// Generated on Fri Feb 10 2023 04:59:26 GMT+0100 (Central European Standard Time)
module.exports = config => { // eslint-disable-line unicorn/prefer-module
  config.set({
    // Base path that will be used to resolve all patterns (eg. files, exclude)
    basePath: '',

    // Frameworks to use
    // available frameworks: https://www.npmjs.com/search?q=keywords:karma-adapter
    frameworks: ['mocha', 'karma-typescript'],

    // List of files / patterns to load in the browser
    files: [{
      pattern: 'tests/**/*.ts',
    }, {
      pattern: 'src/**/*.ts',
    }, {
      pattern: 'tests/fixtures/*.wav',
      watched: false,
      included: false,
      served: true,
      nocache: false,
    }, {
      pattern: 'tests/datasets/*',
      watched: false,
      included: false,
      served: true,
      nocache: false,
    }],

    // List of files / patterns to exclude
    exclude: [
    ],

    // Preprocess matching files before serving them to the browser
    // available preprocessors: https://www.npmjs.com/search?q=keywords:karma-preprocessor
    preprocessors: {
      'src/**/*.ts': ['karma-typescript'],
      'tests/**/*.ts': ['karma-typescript'],
    },

    esbuild: {
      bundle: true,
      sourcemap: true,
      singleBundle: false,
    },

    // Test results reporter to use
    // possible values: 'dots', 'progress'
    // available reporters: https://www.npmjs.com/search?q=keywords:karma-reporter

    reporters: ['progress', 'coverage-istanbul'],

    coverageIstanbulReporter: {
      reports: ['html', 'lcov', 'text-summary'],
      dir: 'coverage/',
    },

    // Web server port
    port: 9876,

    // Enable / disable colors in the output (reporters and logs)
    colors: true,

    // Level of logging
    // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
    logLevel: config.LOG_INFO,

    // Enable / disable watching file and executing tests whenever any file changes
    autoWatch: true,

    // Start these browsers
    // available browser launchers: https://www.npmjs.com/search?q=keywords:karma-launcher
    browsers: ['ChromeHeadlessWithoutAutoplayPolicy'], // You may use 'Chrome', 'ChromeCanary', 'Chromium' or any other supported browser

    // you can define custom flags
    customLaunchers: {
      ChromeHeadlessWithoutAutoplayPolicy: {
        base: 'ChromeHeadless',
        flags: ['--autoplay-policy=no-user-gesture-required'],
      },
    },

    // Continuous Integration mode
    // if true, Karma captures browsers, runs the tests and exits
    singleRun: true,

    // Concurrency level
    // how many browser instances should be started simultaneously
    concurrency: Number.POSITIVE_INFINITY,

    karmaTypescriptConfig: {
      tsconfig: './tsconfig.json',
    },
  });
};
