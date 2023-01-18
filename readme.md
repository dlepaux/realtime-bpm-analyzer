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
- [Usages](#usages)
  - [Realtime (stream/playing) strategy](#realtime--stream--playing--strategy)
  - [Local/Offline strategy](#local--offline-strategy)
- [Development](#development)
- [Tests & Coverage](#tests--coverage)
- [Credits](#credits)

## Getting started

To install this module to your project, just launch the command below:

```bash
npm install realtime-bpm-analyzer
```

To learn more about how to use the library, you can check out [the documentation](https://dlepaux.github.io/realtime-bpm-analyzer).

## Features

- **Dependency-free** library that utilizes the [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) to analyze audio or video sources and provide accurate BPM detection.
- Can be used to analyze audio or video nodes, as well as audio or video streams.
- Allows you to compute the BPM while the audio or video is playing.
- Lightweight and easy to use, making it a great option for web-based music production and DJing applications.

## Usages

If you encounter issues along the way, remember we have a discord server https://discord.gg/3xV7TGmq !

### Realtime (stream/playing) strategy

Mesure or detect the BPM from a **stream** or a **player** ? Meaning that it is technically a stream. The library provide an `AudioWorkletProcessor` that will compute BPM while the stream is distributed.

This example shows how to deal with a simple `audio` node.

1. An [AudioNode](https://developer.mozilla.org/en-US/docs/Web/API/AudioNode) to analyze. So something like this:
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

### Local/Offline strategy

Analyze the BPM from **files** located in your **desktop, tablet or mobile** !

1. Import the library
```javascript
import * as realtimeBpm from 'realtime-bpm-analyzer';
```

2. Use an `input[type=file]` to get the files you want.
```jsx
<input type="file" accept="wav,mp3" onChange={event => this.onFileChange(event)}/>
```

3. You can listen the `change` event like so, and analyze the BPM of the selected files. You don't need to be connected to Internet for this to work.
```javascript
function onFileChange(event) {
  // Get the first file from the list
  const file = event.target.files[0];
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    const audioContext = new window.AudioContext();
    // The file is uploaded, now we decode it
    audioContext.decodeAudioData(reader.result, audioBuffer => {
      // The result is passed to the analyzer
      realtimeBpm.analyzeFullBuffer(audioBuffer).then(topCandidate => {
        // Prints the top candidate, like: 90
        console.log('topCandidate', topCandidate);
      });
    });
  });
  reader.readAsArrayBuffer(file);
};
```

## Development

```bash
npm install
npx husky install
npm test
```

## Tests & Coverage

To launch the test suite, just launch the command below:

```bash
npm test
npm run test:report
```

## Credits

This library was inspired by the [Tornqvist project](https://github.com/tornqvist/bpm-detective), which was also based on [Joe Sullivan's algorithm](http://joesul.li/van/beat-detection-using-web-audio/). Thank you to both of them.
