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

[See the API documentation](https://dlepaux.github.io/realtime-bpm-analyzer/api)

## Introduction

This **dependency free** library allows you to compute the BPM (Beats Per minutes) in realtime of an `audio` / `video` node or streams thanks to the [WebAudioAPI](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API).

Please, note that the main use case of this tool, is to compute the BPM while the video / audio is **playing**.


### WebAudioAPI

> The [WebAudioAPI](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) provides a powerful and versatile system for controlling audio on the Web, allowing developers to choose audio sources, add effects to audio, create audio visualizations, apply spatial effects (such as panning) and much more.


## Motivations

Allegro Project purpose is to permits you to collect the BPM of [Youtube](https://youtube.com) musics listened by the user. Once the data collected the tool shall bind it at the begining of the title.

A schema worst better than a long speech so, let's imagine we are listening a [song](https://www.youtube.com/watch?v=FYH8DsU2WCk) on Youtube. The "raw" title of it is: `New Order - Blue Monday`, once `Allegro` have collected the BPM it will bind it at the begining of the title, so we would have: `[130BPM] New Order - Blue Monday`.

The project is under construction thought and this component [realtime-bpm-analyzer](https://github.com/dlepaux/realtime-bpm-analyzer) is an essential piece of the project.


## Installation

To install this module to your project, just launch the command below:

```bash
npm install realtime-bpm-analyzer
```


## Development

```bash
npm run serve
```

## Tests & Coverage

To launch the test suite, just launch the command below:

```bash
npm test
```


## Usage

1. An [AudioNode](https://developer.mozilla.org/en-US/docs/Web/API/AudioNode) to analyze. So something like this :
    ```html
    <audio src="./new_order-blue_monday.mp3" id="track"></audio>
    ```

2. Connect the [AudioNode](https://developer.mozilla.org/en-US/docs/Web/API/AudioNode) to the [AudioContext](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext) **and** create an [AudioContext.createScriptProcessor()](https://developer.mozilla.org/en-US/docs/Web/API/ScriptProcessorNode).
    ```javascript
    // Create new instance of AudioContext
    const audioContext = new AudioContext();
    // Set the source with the HTML Audio Node
    const source = audioContext.createMediaElementSource(document.getElementById('track'));
    // Set the scriptProcessorNode to get PCM data in real time
    const scriptProcessorNode = audioContext.createScriptProcessor(4096, 1, 1);
    // Connect everythings together
    scriptProcessorNode.connect(audioContext.destination);
    source.connect(scriptProcessorNode);
    source.connect(audioContext.destination);
    ```
    
3. Now you have just to configure the tool and attach it to the [audioprocess](https://developer.mozilla.org/en-US/docs/Web/Events/audioprocess) event like this :
    ```javascript
    import RealTimeBPMAnalyzer from 'realtime-bpm-analyzer';

    const onAudioProcess = new RealTimeBPMAnalyzer({
        scriptNode: {
            bufferSize: 4096
        },
        pushTime: 2000,
        pushCallback: (err, bpm) => {
            console.log('bpm', bpm);
        }
    });
    // Attach realTime function to audioprocess event.inputBuffer (AudioBuffer)
    scriptProcessorNode.onaudioprocess = (e) => {
        onAudioProcess.analyze(e);
    };
    ```


## Technical approch

This tool has been largely inspired by the [Tornqvist project](https://github.com/tornqvist/bpm-detective), which is actually optimized to compute the BPM of a song as fast as possible and not during the plying.

The algorithm use an AudioBuffer in input. We apply on it a lowpass filter to get bass frequencies. Then, we extract raw data (PCM, Pulse Code Modulation, each points is between 1 and -1) to detect peaks.

|                                       | Description                                                                                     |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| ![pcm data](https://dlepaux.github.io/realtime-bpm-analyzer/img/pcm.png "PCM Data") | PCM Data are dots with value between the max/min amplitude (1/-1). Each dots have its own index |

To detect peaks, we will test the whole AudioBuffer with a high thresold (setted to 0.9), on the amplitude axis. We need a minimum of 15 occurence to confirm a valid BPM. To find the occurencies that we need, we will decrease the thresold with a step of `0.05`.

When a peak is found, we will search for the next by jumping `10 000` indexes of PCM data, this means that we ignore `0.25` second of the song, in other words we simply ignore the descending phase of the peak.

Feel free to [contact me by mail](mailto:d.lepaux@gmail.com) or [join the chat](https://gitter.im/realtime-bpm-analyzer/Lobby) if you have any questions.

## Todo

- Migrate from VueJS 3 to NextJS for better SEO
- Migrate from ScriptProcessorNode to AudioWorklet


## Credits

This library was been inspired from [Tornqvist project](https://github.com/tornqvist/bpm-detective) which also based on [Joe Sullivan's algorithm](http://joesul.li/van/beat-detection-using-web-audio/). Thank you to both of them !


## Final

If this project helped you in any way or if you want to support it, you can always leave me a tip here:

BTC **36eHnxCRUDfWNFEx3YebRGw12WeutjkBBt**

ETH **0x0F8b4F026624150e9F6267bFD93C372eb98e3010**
