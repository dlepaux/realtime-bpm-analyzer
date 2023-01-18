# Realtime BPM Analyzer
[![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/xojs/xo)
[![npm](https://img.shields.io/npm/dm/realtime-bpm-analyzer.svg)](https://www.npmjs.com/package/realtime-bpm-analyzer)
[![npm](https://img.shields.io/npm/l/realtime-bpm-analyzer.svg)](https://github.com/dlepaux/realtime-bpm-analyzer/blob/master/licence.md)
[![CI Actions Status](https://github.com/dlepaux/realtime-bpm-analyzer/workflows/CI/badge.svg)](https://github.com/dlepaux/realtime-bpm-analyzer/actions)
[![Join the chat at https://gitter.im/realtime-bpm-analyzer/Lobby](https://badges.gitter.im/realtime-bpm-analyzer/Lobby.svg)](https://gitter.im/realtime-bpm-analyzer/Lobby?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

<div>
  <p align="center">
    <img src="https://dlepaux.github.io/realtime-bpm-analyzer/realtime-bpm-analyzer-icon.png" style="width: 200px; height: auto;">
  </p>
</div>

Welcome to Realtime BPM Analyzer, a powerful and easy-to-use TypeScript/JavaScript library for detecting the beats-per-minute (BPM) of an audio or video source in real-time.

- [Getting started](#getting-started)
- [Features](#features)
- [Usage example](#usage-example)
- [Development](#development)
- [Tests & Coverage](#tests-&-coverage)
- [Credits](#credits)

## Getting started {#getting-started}

To install this module to your project, just launch the command below:

```bash
npm install realtime-bpm-analyzer
```

To learn more about how to use the library, you can check out [the documentation](https://dlepaux.github.io/realtime-bpm-analyzer).

## Features {#features}

- **Dependency-free** library that utilizes the [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) to analyze audio or video sources and provide accurate BPM detection.
- Can be used to analyze audio or video nodes, as well as audio or video streams.
- Allows you to compute the BPM while the audio or video is playing.
- Lightweight and easy to use, making it a great option for web-based music production and DJing applications.

## Usage example {#usage-example}

Join our discord server https://discord.gg/3xV7TGmq !

1. An [AudioNode](https://developer.mozilla.org/en-US/docs/Web/API/AudioNode) to analyze. So something like this :
    ```html
    <audio src="./new_order-blue_monday.mp3" id="track"></audio>
    ```

2. Create the AudioWorkletProcessor with `createRealTimeBpmProcessor`, create and pipe the lowpass filter to the AudioWorkletNode (`realtimeAnalyzerNode`).
    ```javascript
    import { createRealTimeBpmProcessor } from 'realtime-bpm-analyzer';

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
    ```

3. You also need to expose the file `dist/realtime-bpm-processor.js` (already bundled) to your public root diretory. Typically, this file must be available at http://yourdomain/realtime-bpm-processor.js.

    ```javascript
    // For NextJS see your next.config.js and add this:
    // You also need to install `npm install copy-webpack-plugin@6.4.1 -D`
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
    ```

## Development {#development}

```bash
npm install
npx husky install
npm test
```

## Tests & Coverage {#tests-&-coverage}

To launch the test suite, just launch the command below:

```bash
npm test
npm run test:report
```

## Credits {#credits}

This library was inspired by the [Tornqvist project](https://github.com/tornqvist/bpm-detective), which was also based on [Joe Sullivan's algorithm](http://joesul.li/van/beat-detection-using-web-audio/). Thank you to both of them.
