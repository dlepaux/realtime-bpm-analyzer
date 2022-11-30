# RealTime BPM Analyzer

[![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/xojs/xo)
[![npm](https://img.shields.io/npm/dm/realtime-bpm-analyzer.svg)](https://www.npmjs.com/package/realtime-bpm-analyzer)
[![npm](https://img.shields.io/npm/l/realtime-bpm-analyzer.svg)](https://github.com/dlepaux/realtime-bpm-analyzer/blob/master/licence.md)
[![CI Actions Status](https://github.com/dlepaux/realtime-bpm-analyzer/workflows/CI/badge.svg)](https://github.com/dlepaux/realtime-bpm-analyzer/actions)
[![Join the chat at https://gitter.im/realtime-bpm-analyzer/Lobby](https://badges.gitter.im/realtime-bpm-analyzer/Lobby.svg)](https://gitter.im/realtime-bpm-analyzer/Lobby?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

<div>
  <p align="center">
    <img src="https://dlepaux.github.io/realtime-bpm-analyzer/img/allegro-project.png" style="max-width: 100%; height: auto;">
  </p>
</div>

## Documentation

[See the documentation](https://dlepaux.github.io/realtime-bpm-analyzer/)

Checkout [gh-pages](https://github.com/dlepaux/realtime-bpm-analyzer/tree/gh-pages) branch to edit the github-pages.

[See the API documentation](https://dlepaux.github.io/realtime-bpm-analyzer/api)

## Introduction

This **dependency free** library allows you to compute the BPM (Beats Per minutes) in realtime of an `audio` / `video` node or streams thanks to the [WebAudioAPI](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API).

Please, note that the main use case of this tool, is to compute the BPM while the video / audio is **playing**.


### WebAudioAPI

> The [WebAudioAPI](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) provides a powerful and versatile system for controlling audio on the Web, allowing developers to choose audio sources, add effects to audio, create audio visualizations, apply spatial effects (such as panning) and much more.


## Motivations

Allegro Project purpose is to permits you to collect the BPM of [Youtube](https://youtube.com) musics listened by the user. Once the data collected the tool shall bind it at the begining of the title.

Let's imagine we are listening a [song](https://www.youtube.com/watch?v=FYH8DsU2WCk) on Youtube. The "raw" title of it is: `New Order - Blue Monday`, once `Allegro` have collected the BPM it will bind it at the begining of the title, so we would have: `[130BPM] New Order - Blue Monday`.

The project is under construction thought and this component [realtime-bpm-analyzer](https://github.com/dlepaux/realtime-bpm-analyzer) is an essential piece of the project.


## Installation

To install this module to your project, just launch the command below:

```bash
npm install realtime-bpm-analyzer
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


## Usage

1. An [AudioNode](https://developer.mozilla.org/en-US/docs/Web/API/AudioNode) to analyze. So something like this :
    ```html
    <audio src="./new_order-blue_monday.mp3" id="track"></audio>
    ```

2. Provoide your [AudioNode](https://developer.mozilla.org/en-US/docs/Web/API/AudioNode) to `RealTimeBpmAnalyzer` like the following and enjoy the beat.
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
        console.log('BPM', event);
      }
      if (event.data.message === 'BPM_STABLE') {
        console.log('BPM_STABLE', event);
      }
    };
    ```

## Technical approch

This tool has been largely inspired by the [Tornqvist project](https://github.com/tornqvist/bpm-detective), which is actually optimized to compute the BPM of a song as fast as possible and not while playing it.

The algorithm basically detect peaks in the bass frequencies and try to figure out the best BPM candidates.

|                                       | Description                                                                                     |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| ![pcm data](https://dlepaux.github.io/realtime-bpm-analyzer/img/pcm.png "PCM Data") | PCM Data are dots with value between the max/min amplitude (1/-1). Each dots have its own index |

Feel free to [contact me by mail](mailto:d.lepaux@gmail.com) or [join the chat](https://gitter.im/realtime-bpm-analyzer/Lobby) if you have any questions.

## Credits

This library was been inspired from [Tornqvist project](https://github.com/tornqvist/bpm-detective) which also based on [Joe Sullivan's algorithm](http://joesul.li/van/beat-detection-using-web-audio/). Thank you to both of them !


## Final

If this project helped you in any way or if you want to support it, you can always leave me a tip here:

BTC **36eHnxCRUDfWNFEx3YebRGw12WeutjkBBt**

ETH **0x0F8b4F026624150e9F6267bFD93C372eb98e3010**
