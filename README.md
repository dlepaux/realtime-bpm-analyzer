# RealTime BPM/Tempo Analyzer


[![Greenkeeper badge](https://badges.greenkeeper.io/dlepaux/realtime-bpm-analyzer.svg)](https://greenkeeper.io/)
[![Build Status](https://travis-ci.org/dlepaux/realtime-bpm-analyzer.svg?branch=master)](https://travis-ci.org/dlepaux/realtime-bpm-analyzer)
[![Coverage Status](https://coveralls.io/repos/github/dlepaux/realtime-bpm-analyzer/badge.svg?branch=master)](https://coveralls.io/github/dlepaux/realtime-bpm-analyzer?branch=master)
[![npm](https://img.shields.io/npm/l/express.svg)]()
[![Join the chat at https://gitter.im/realtime-bpm-analyzer/Lobby](https://badges.gitter.im/realtime-bpm-analyzer/Lobby.svg)](https://gitter.im/realtime-bpm-analyzer/Lobby?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

This tool allow to compute the BPM (Beats Per minutes) in real time, of a song on an `<audio></audio>` or `<video></video>` node thanks to the [WebAudioAPI](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API).

Please, note that the main use case for this tool, is to get the BPM **during** the video / audio **play**.

### WebAudioAPI

> The [WebAudioAPI](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) provides a powerful and versatile system for controlling audio on the Web, allowing developers to choose audio sources, add effects to audio, create audio visualizations, apply spatial effects (such as panning) and much more.


## Usage / Requirements

1. An [AudioNode](https://developer.mozilla.org/en-US/docs/Web/API/AudioNode) to analyze. So something like this :
    ```html
    <audio src="./new_order-blue_monday.mp3" id="track"></audio>
    ```

2. Connect the [AudioNode](https://developer.mozilla.org/en-US/docs/Web/API/AudioNode) to the [AudioContext](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext) **and** create an [AudioContext.createScriptProcessor()](https://developer.mozilla.org/en-US/docs/Web/API/ScriptProcessorNode).
    ```javascript
    // Create new instance of AudioContext
    var audioContext = new AudioContext();
    // Set the source with the HTML Audio Node
    var source = audioContext.createMediaElementSource(document.getElementById('track'));
    // Set the scriptProcessorNode to get PCM data in real time
    var scriptProcessorNode = audioContext.createScriptProcessor(4096, 1, 1);
    // Connect everythings together
    scriptProcessorNode.connect(audioContext.destination);
    source.connect(scriptProcessorNode);
    source.connect(audioContext.destination);
    ```
    
3. Now you have just to configure the tool and attach it to the [audioprocess](https://developer.mozilla.org/en-US/docs/Web/Events/audioprocess) event like this :
    ```javascript
    var RealTimeBPMAnalyzer = include('realtime-bpm-analyzer');
    var onAudioProcess = new RealTimeBPMAnalyzer({
        scriptNode: {
            bufferSize: 4096,
            numberOfInputChannels: 1,
            numberOfOutputChannels: 1
        },
        pushTime: 2000,
        pushCallback: function (err, bpm) {
            console.log('bpm', bpm);
        }
    });
    // Attach realTime function to audioprocess event.inputBuffer (AudioBuffer)
    scriptProcessorNode.onaudioprocess = function (e) {
        onAudioProcess.analyze(e.inputBuffer);
    };
    ```

## Example

You can find here [a functionnal exemple](https://github.com/dlepaux/realtime-bpm-analyzer-exemple) of this tool.


## Technical approch

This tool has been largely inspired by the [Tornqvist project](https://github.com/tornqvist/bpm-detective).

His algorithm use an AudioBuffer in input. We apply a lowpass filter to get only bass frequencies.

Now, we extract brut data (PCM, Pulse Code Modulation, each points is between 1 and -1) to detect peaks.

|                                       | Description                                                                                     |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| ![pcm data](./doc/pcm.png "PCM Data") | PCM Data are dots with value between the max/min amplitude (1/-1). Each dots have its own index |

To do this job, we start with a thresold setted to 0.9 (on the amplitude axis) and we search a minimal peak number (~15) by decrementing this thresold by 0.05 through all the AudioBuffer.
When we find a peak, we jump 10000 peaks index (1/4 second) to ignore the descendant phase of the peak...

---

This tool is designed to detect BPM by detecting all peaks for all thresolds, because we work on chunks (AudioBuffer). So we can recompute the BPM with intervals, etc.. without recompute everything with a full AudioBuffer.


## Credits

This library was been inspired from [Tornqvist project](https://github.com/tornqvist/bpm-detective) which also based on [Joe Sullivan's algorithm](http://joesul.li/van/beat-detection-using-web-audio/). Thank you to both of them

## Todo
- Add controls
