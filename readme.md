# Realtime BPM Analyzer
[![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/xojs/xo)
[![npm](https://img.shields.io/npm/dm/realtime-bpm-analyzer.svg)](https://www.npmjs.com/package/realtime-bpm-analyzer)
[![npm](https://img.shields.io/npm/l/realtime-bpm-analyzer.svg)](https://github.com/dlepaux/realtime-bpm-analyzer/blob/master/licence.md)
[![CI Actions Status](https://github.com/dlepaux/realtime-bpm-analyzer/workflows/CI/badge.svg)](https://github.com/dlepaux/realtime-bpm-analyzer/actions)
[![codecov](https://codecov.io/gh/dlepaux/realtime-bpm-analyzer/branch/main/graph/badge.svg)](https://codecov.io/gh/dlepaux/realtime-bpm-analyzer)
[![Join the chat at https://gitter.im/realtime-bpm-analyzer/Lobby](https://badges.gitter.im/realtime-bpm-analyzer/Lobby.svg)](https://gitter.im/realtime-bpm-analyzer/Lobby?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

<div>
  <p align="center">
    <img src="https://www.realtime-bpm-analyzer.com/realtime-bpm-analyzer-share.png" style="width: 100%; height: auto;">
  </p>
</div>

Welcome to Realtime BPM Analyzer, a powerful and easy-to-use TypeScript/JavaScript library for detecting the beats-per-minute (BPM) of an audio or video source in real-time.

- [Getting started](#getting-started)
  - [NextJS](#nextjs)
  - [Esbuild](#esbuild)
- [Features](#features)
- [Usages](#usages)
  - [Realtime/Onfly strategy](#realtimeonfly-strategy)
  - [Continuous Analysis strategy](#continuous-analysis-strategy)
  - [Local/Offline strategy](#localoffline-strategy)
- [Roadmap](#roadmap)
- [Development](#development)
- [Tests & Coverage](#tests--coverage)
- [Credits](#credits)

## Getting started

To install this module to your project, just launch the command below:

```bash
npm install realtime-bpm-analyzer
```

To learn more about how to use the library, you can check out [the documentation](https://www.realtime-bpm-analyzer.com).

## Features

- **Dependency-free** library that utilizes the [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) to analyze audio or video sources and provide accurate BPM detection.
- Can be used to analyze **audio or video** nodes, streams as well as **files**.
- Allows you to compute the BPM while the audio or video is playing.
- Lightweight and easy to use, making it a great option for web-based music production and DJing applications.

## Usages

If you encounter issues along the way, remember we have a [discord server](https://discord.gg/3xV7TGmq) and a [chat](https://gitter.im/realtime-bpm-analyzer/Lobby) !

### Realtime/Onfly strategy

Mesure or detect the BPM from a **player** (Typically if you don't own the audio file) ? The library provide an `AudioWorkletProcessor` that will compute BPM while the music is played.

This example shows how to deal with a simple `audio` node.

1. An [AudioNode](https://developer.mozilla.org/en-US/docs/Web/API/AudioNode) to analyze. So something like this:
```html
<audio src="./new_order-blue_monday.mp3" id="track"></audio>
```

2. Create the AudioWorkletProcessor with `createRealTimeBpmProcessor`, create and pipe the filters to the AudioWorkletNode (`realtimeAnalyzerNode`).
```javascript
import { createRealTimeBpmProcessor } from 'realtime-bpm-analyzer';

const realtimeAnalyzerNode = await createRealTimeBpmProcessor(audioContext);

// Set the source with the HTML Audio Node
const track = document.getElementById('track');
const source = audioContext.createMediaElementSource(track);

// Connect nodes together
source.connect(realtimeAnalyzerNode);
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

### Continuous Analysis strategy

Analyze the BPM from a stream or a source where you can't determine the start/end of a music.

1. Streams can be played with [AudioNode](https://developer.mozilla.org/en-US/docs/Web/API/AudioNode), so the approch is quite similar to the [Realtime/Onfly strategy](#realtimeonfly-strategy).
```html
<audio src="https://ssl1.viastreaming.net:7005/;listen.mp3" id="track"></audio>
```
NB: Thank you [IbizaSonica](http://ibizasonica.com) for the stream.

2. As for the [Realtime/Onfly strategy](#realtimeonfly-strategy), except that we need to turn on the `continuousAnalysis` flag to periodically RESET collected data.
```javascript
import { createRealTimeBpmProcessor } from 'realtime-bpm-analyzer';

const realtimeAnalyzerNode = await createRealTimeBpmProcessor(audioContext);

// Set the source with the HTML Audio Node
const track = document.getElementById('track');
const source = audioContext.createMediaElementSource(track);

// Connect nodes together
source.connect(realtimeAnalyzerNode);
source.connect(audioContext.destination);

// Set continuousAnalysis to true
realtimeAnalyzerNode.port.postMessage({
  message: 'ASYNC_CONFIGURATION',
  parameters: {
    continuousAnalysis: true,
    stabilizationTime: 20_000, // Default value is 20_000ms after what the library will automatically delete all collected data and restart analysing BPM
  }
})

realtimeAnalyzerNode.port.onmessage = (event) => {
  if (event.data.message === 'BPM') {
    console.log('BPM', event.data.result);
  }
  if (event.data.message === 'BPM_STABLE') {
    console.log('BPM_STABLE', event.data.result);
  }
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
      realtimeBpm.analyzeFullBuffer(audioBuffer).then(topCandidates => {
        // Do something with the BPM
        console.log('topCandidates', topCandidates);
      });
    });
  });
  reader.readAsArrayBuffer(file);
};
```

## Roadmap

- [ ] Add confidence level of Tempo
- [ ] Combine Amplitude Thresholding strategy with others to improve BPM accuracy
- [ ] Improve the continous analysis in order to ignore drops and cuts
- [ ] Monitore memory usage

Let us know what is your most wanted feature by opening [an issue](https://github.com/dlepaux/realtime-bpm-analyzer/issues).

## Development

The test suite is built on top of karma and is very practical to test new features. Before running tests switch the `singleRun` property of `karma.config.js` to leave the browser open after the tests.

```bash
npm install
npm run prepare
npm test
```

## Tests & Coverage

To launch the test suite, just launch the command below:

```bash
open http://localhost:9876
npm test
```

Note that tests requires real human gesture to be successfully run!

## Credits

This library was inspired by the [Tornqvist project](https://github.com/tornqvist/bpm-detective), which was also based on [Joe Sullivan's algorithm](http://joesul.li/van/beat-detection-using-web-audio/). Thank you to both of them.
