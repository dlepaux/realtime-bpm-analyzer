const process = require('process');

const config = {
  publicPath: process.env.NODE_ENV === 'production' ? '/realtime-bpm-analyzer/' : '/',
};

module.exports = config;
