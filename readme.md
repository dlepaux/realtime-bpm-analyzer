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

> **New in v5.0**: Clean typed event API with full TypeScript support! See the [migration guide](https://www.realtime-bpm-analyzer.com/guide/migration-v4) if upgrading from v3.x.

```typescript
// Simple, typed event listeners with autocomplete
analyzer.on('bpm', (data) => {
  console.log('BPM:', data.bpm[0].tempo);
});

analyzer.on('bpmStable', (data) => {
  console.log('Stable BPM:', data.bpm[0].tempo);
});
```

- [Realtime BPM Analyzer](#realtime-bpm-analyzer)
  - [Getting started](#getting-started)
  - [Features](#features)
  - [Usages](#usages)
    - [Player strategy](#player-strategy)
    - [Continuous Analysis strategy](#continuous-analysis-strategy)
    - [Local/Offline strategy](#localoffline-strategy)
  - [Development](#development)
    - [Unit Tests](#unit-tests)
    - [Dataset Testing](#dataset-testing)
    - [New features](#new-features)
    - [Technical Documentation](#technical-documentation)
  - [Commercial Usage](#commercial-usage)
  - [Roadmap](#roadmap)
  - [Credits](#credits)

## Getting started

To install this module to your project, just launch the command below:

```bash
npm install realtime-bpm-analyzer
```

To learn more about how to use the library, you can check out [the documentation](https://www.realtime-bpm-analyzer.com).

## Features

- **Typed Event API** (new in v5.0) with full TypeScript autocomplete support
- **Dependency-free** library that utilizes the [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) to analyze audio or video sources and provide accurate BPM detection.
- Can be used to analyze **audio or video** nodes, streams as well as **files**.
- Allows you to compute the BPM while the audio or video is playing.
- Lightweight and easy to use, making it a great option for web-based music production and DJing applications.
- Supports MP3, FLAC and WAV formats.

## Usages

If you encounter issues along the way, remember I have a [chat](https://gitter.im/realtime-bpm-analyzer/Lobby) and the new [discussion feature of github](https://github.com/dlepaux/realtime-bpm-analyzer/discussions) !

### Player strategy

Measure or detect the BPM from a web **player**.

This example shows how to deal with a simple `audio` node.

1. An [AudioNode](https://developer.mozilla.org/en-US/docs/Web/API/AudioNode) to analyze. So something like this:
```html
<audio src="./new_order-blue_monday.mp3" id="track"></audio>
```

2. Create the AudioWorkletProcessor with `createRealTimeBpmProcessor`, create and pipe the filters to the AudioWorkletNode (`realtimeAnalyzerNode`).
```javascript
import { createRealTimeBpmProcessor, getBiquadFilter } from 'realtime-bpm-analyzer';

const realtimeAnalyzerNode = await createRealTimeBpmProcessor(audioContext);

// Set the source with the HTML Audio Node
const track = document.getElementById('track');
const source = audioContext.createMediaElementSource(track);
const lowpass = getBiquadFilter(audioContext);

// Connect nodes together
source.connect(lowpass).connect(realtimeAnalyzerNode);
source.connect(audioContext.destination);

// Listen for BPM events with typed listeners
realtimeAnalyzerNode.on('bpm', (data) => {
  console.log('BPM', data.bpm);
});

realtimeAnalyzerNode.on('bpmStable', (data) => {
  console.log('BPM_STABLE', data.bpm);
});
```

### Continuous Analysis strategy

Analyze the BPM of a source continuously. This feature is quite simple and basically get rid of all data inside the analyzer after the stabilizationTime is reached. Why ? Because we store all the "valid peaks" for each thresholds in order to find the best candidates. And we would keep all those data forever, we would have memory leaks.

Note: This approach is **NOT recommended** if you are using a microphone as source. Except if the microphone gets correct audio source. Typically, if the BPM is never computed using this approach, you probably capture low intensity audio with your microphone (too far from the source, too much noise, directional microphone could be reasons why it's not working).

1. Streams can be played with [AudioNode](https://developer.mozilla.org/en-US/docs/Web/API/AudioNode), so the approach is quite similar to the [Player strategy](#player-strategy).
```html
<audio src="https://ssl1.viastreaming.net:7005/;listen.mp3" id="track"></audio>
```
Thank you [IbizaSonica](http://ibizasonica.com) for the stream.

2. As for the [Player strategy](#player-strategy), except that we need to turn on the `continuousAnalysis` flag to periodically delete collected data.
```javascript
import { createRealTimeBpmProcessor, getBiquadFilter } from 'realtime-bpm-analyzer';

const realtimeAnalyzerNode = await createRealTimeBpmProcessor(audioContext, {
  continuousAnalysis: true,
  stabilizationTime: 20_000, // Default value is 20_000ms after what the library will automatically delete all collected data and restart analyzing BPM
});

// Set the source with the HTML Audio Node
const track = document.getElementById('track');
const source = audioContext.createMediaElementSource(track);
const lowpass = getBiquadFilter(audioContext);

// Connect nodes together
source.connect(lowpass).connect(realtimeAnalyzerNode);
source.connect(audioContext.destination);

// Listen for BPM events with typed listeners
realtimeAnalyzerNode.on('bpm', (data) => {
  console.log('BPM', data.bpm);
});

realtimeAnalyzerNode.on('bpmStable', (data) => {
  console.log('BPM_STABLE', data.bpm);
});

// Listen for when analyzer resets (after stabilizationTime)
realtimeAnalyzerNode.on('analyzerReset', () => {
  console.log('Analyzer reset - starting fresh analysis');
});
```

### Local/Offline strategy

Analyze the BPM from **files** located on your **desktop, tablet or mobile**!

1. Import the library
```javascript
import * as realtimeBpm from 'realtime-bpm-analyzer';
```

2. Use an `input[type=file]` to get the files you want.
```jsx
<input type="file" accept="wav,mp3,flac" onChange={event => this.onFileChange(event)}/>
```

3. You can listen to the `change` event like so, and analyze the BPM of the selected files. You don't need to be connected to the Internet for this to work.
```javascript
function onFileChange(event) {
  const audioContext = new AudioContext();
  // Get the first file from the list
  const file = event.target.files[0];
  const reader = new FileReader();
  reader.addEventListener('load', () => {
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

## Development

Realtime BPM Analyzer is using [Web Test Runner](https://modern-web.dev/docs/test-runner/overview/) to handle **Unit tests** and [Web Dev Server](https://modern-web.dev/docs/dev-server/overview/) to handle **Dataset testing**.

You will first need to install the project following these commands:

```bash
npm install
npm run prepare
```

### Unit Tests

To run the unit tests, you just have to run `npm test`.

### Dataset Testing

To test a whole dataset of audio files you have to drop those files into `testing/datasets` and then run: `npm run testing:prepare` to create a manifest that contains the file name and the BPM (typically the verified one) from the metadata.

```json
{
  "my music file.mp3": 130
}
```

You also need to build the library with `npm run build`.

Once those steps are done you can run `npm run testing` to challenge the library against your dataset. The [Local/Offline strategy](#localoffline-strategy) is used here.

### New features

If you're developing a new feature and you want to test it in another project, you can run `bin/build/to-project.sh nameOfTheProject`. This command will create package with `npm pack` and copy it into the target project `nameOfTheProject` sitting next to this one. You will then be able to test a production-like package.

### Technical Documentation

[TypeDoc](https://www.npmjs.com/package/typedoc) is used to build the technical documentation of Realtime BPM Analyzer. To build the documentation run: `npm run build:docs`;

## Commercial Usage

This library is distributed under the terms of the Apache License, Version 2.0. However, if you are interested in using this library in a commercial context or require a commercial license, please feel free to contact me.

For inquiries regarding commercial usage, licensing options, or any other questions, please contact me:
```
David Lepaux
d.lepaux@gmail.com
```
I am open to discussing custom licensing arrangements to meet your specific needs and ensure that you can use this library in your commercial projects with confidence.

## Roadmap

- [ ] Add confidence level of Tempo
- [ ] Combine Amplitude Thresholding strategy with others to improve BPM accuracy
- [ ] Improve the continuous analysis in order to ignore drops and cuts
- [ ] Monitor memory usage

Let me know what your most wanted feature is by opening [an issue](https://github.com/dlepaux/realtime-bpm-analyzer/issues).

## Credits

This library was inspired by the [Tornqvist project](https://github.com/tornqvist/bpm-detective), which was also based on [Joe Sullivan's algorithm](http://joesul.li/van/beat-detection-using-web-audio/). Thank you to both of them.
