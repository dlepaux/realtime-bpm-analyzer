export const routeExemples = {
  'audio-node': 'Audio Node',
  'user-media': 'User Media',
  stream: 'Stream',
};

export const getAudioContext = () => new (window.AudioContext || window.mozAudioContext || window.webkitAudioContext)();

export const exampleMusicFile = `${process.env.PREFIX_URL}/media/new_order-blue_monday.mp3`;

export const installationCommand = 'npm install realtime-bpm-analyzer';

export const usageStepOne = `<audio src="${process.env.PREFIX_URL}/media/new_order-blue_monday.mp3" id="music"></audio>`;

export const usageStepTwo = `import { createRealTimeBpmProcessor } from 'realtime-bpm-analyzer';

const realtimeAnalyzerNode = await createRealTimeBpmProcessor(audioContext);

// Set the source with the HTML Audio Node
const track = document.getElementById('track');
const source = audioContext.createMediaElementSource(track);

// Lowpass filter
const filter = audioContext.createBiquadFilter();
filter.type = 'lowpass';

// Connect stuff together
source.connect(filter).connect(realtimeAnalyzerNode);
source.connect(audioContext.destination);

realtimeAnalyzerNode.port.onmessage = (event) => {
  if (event.data.message === 'BPM') {
    console.log('BPM', event.data.result);
  }
  if (event.data.message === 'BPM_STABLE') {
    console.log('BPM_STABLE', event.data.result);
  }
};
`;

export const usageStepThree = `// For NextJS see your next.config.js and add this:
// You also need to install 'npm install copy-webpack-plugin@6.4.1 -D'
// Note that the latest version (11.0.0) didn't worked properly with NextJS 12
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
module.exports = {
webpack: config => {
    config.plugins.push(
      new CopyPlugin({
        patterns: [
          {
            from: './node_modules/realtime-bpm-analyzer/dist/realtime-bpm-processor.js',
            to: path.resolve(__dirname, 'public'),
          },
        ],
      },
      ));

    return config;
  },
};
`;
