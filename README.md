# RealTime BPM/Tempo Analyzer

[![Greenkeeper badge](https://badges.greenkeeper.io/dlepaux/realtime-bpm-analyzer.svg)](https://greenkeeper.io/) [![Build Status][travis-badge]][travis] [![Coverage Status](https://coveralls.io/repos/github/dlepaux/realtime-bpm-analyser/badge.svg?branch=dev)](https://coveralls.io/github/dlepaux/realtime-bpm-analyser?branch=dev)
[![npm](https://img.shields.io/npm/l/express.svg)]()

This tool allow to compute the BPM (Beats Per minutes) in real time, of a song on an <audio></audio> or <video></video> node thanks to the [WebAudioAPI](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API).

Please, note that the main use case for this tool, is to get the BPM **during** the video / audio **play**. In fact, it pre-compute datas instead to store the entire AudioBuffer in memory. So it can quickly return BPM.

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
    // Attach realTime function to audioprocess event
    scriptProcessorNode.onaudioprocess = function (e) {
        onAudioProcess.analyze(e);
    };
    ```

## References

This library was been inspired from [Tornqvist project](https://github.com/tornqvist/bpm-detective) which also based on [Joe Sullivan's algorithm](http://joesul.li/van/beat-detection-using-web-audio/). Thank you to both of them

