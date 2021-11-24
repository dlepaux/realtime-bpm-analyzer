const isProd = process.env.NODE_ENV === 'production';

module.exports = { // eslint-disable-line unicorn/prefer-module
  env: {
    PREFIX_URL: isProd ? '/realtime-bpm-analyzer' : '',
  },
  basePath: isProd ? '/realtime-bpm-analyzer' : '',
  assetPrefix: isProd ? '/realtime-bpm-analyzer/' : '/',
};
