const isProd = process.env.NODE_ENV === 'production';

const path = require('path'); // eslint-disable-line unicorn/prefer-module
const CopyPlugin = require('copy-webpack-plugin'); // eslint-disable-line unicorn/prefer-module

module.exports = { // eslint-disable-line unicorn/prefer-module
  env: {
    PREFIX_URL: isProd ? '/realtime-bpm-analyzer' : '',
  },
  basePath: isProd ? '/realtime-bpm-analyzer' : '',
  assetPrefix: isProd ? '/realtime-bpm-analyzer/' : '/',
  webpack: config => {
    // Important: return the modified config
    config.plugins.push(
      new CopyPlugin({
        patterns: [
          {
            from: './node_modules/realtime-bpm-analyzer/dist/realtime-bpm-processor.js',
            to: path.resolve(__dirname, 'public'), // eslint-disable-line unicorn/prefer-module
          },
          {
            from: './api',
            to: path.resolve(__dirname, 'docs', 'api'), // eslint-disable-line unicorn/prefer-module
          },
        ],
      },
      ));

    return config;
  },
};
