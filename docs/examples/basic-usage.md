---
title: BPM Finder — Detect BPM from an Audio File
description: Live demo. Drop an MP3, WAV, or FLAC file and get the BPM in your browser. Vanilla JavaScript example with full source. The file stays in your browser.
---

# Basic Usage

This guide demonstrates how to analyze BPM from audio files using Realtime BPM Analyzer.

## Live Demo

Try the interactive demo below - this is the **actual vanilla JavaScript example** running. You can use your own audio files to see it in action! It shows every field of the reading the file gives: `bpm`, `bpmExact`, `confidence` and the candidates.

<ExampleEmbed example="01-vanilla-basic" height="720px" />

::: tip View Source Code
The complete source code for this example is available in the [`examples/01-vanilla-basic`](https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/examples/01-vanilla-basic) directory.
:::

## How It Works

The basic pattern for analyzing audio files is straightforward:

```typescript
import { analyzeFullBuffer } from 'realtime-bpm-analyzer';

// 1. Create an audio context
const audioContext = new AudioContext();

// 2. Load and decode your audio file
const arrayBuffer = await file.arrayBuffer();
const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

// 3. Analyze the buffer
const reading = await analyzeFullBuffer(audioBuffer);

// 4. Get the detected BPM: null for silence or audio without a clear beat
console.log(reading ? `Detected BPM: ${reading.bpm}` : 'No clear beat');
```

This approach analyzes the **complete audio file** at once, making it perfect for:
- Music library organization
- DJ applications  
- Fitness apps
- Any scenario where you need the tempo of a complete song

## Every Example

Nine examples: three inputs, each written in vanilla TypeScript, React and Vue, with the same names and layout so you can compare them. Each one's readme says how to run it from a clean clone.

| Input | What it shows | Vanilla | React | Vue |
|-------|---------------|---------|-------|-----|
| An audio file | `analyzeFullBuffer`: the reading's `bpm`, `bpmExact`, `confidence` and candidates, or `null` when the file has no clear tempo | [01-vanilla-basic](https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/examples/01-vanilla-basic) | [04-react-basic](https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/examples/04-react-basic) | [07-vue-basic](https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/examples/07-vue-basic) |
| An audio URL, as it plays | `analyzer.state`, each `statechange`, `progress`, `error` and each live reading, with **Start over** (`reset()`) and **Stop** (`stop()`) | [02-vanilla-streaming](https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/examples/02-vanilla-streaming) | [05-react-streaming](https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/examples/05-react-streaming) | [08-vue-streaming](https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/examples/08-vue-streaming) |
| The microphone | The same as an audio URL, with the track passed as `liveInput`, so lost input shows as `audio-lost` | [03-vanilla-microphone](https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/examples/03-vanilla-microphone) | [06-react-microphone](https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/examples/06-react-microphone) | [09-vue-microphone](https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/examples/09-vue-microphone) |

Try them here: the vanilla ones on this page, [Streaming Audio](/examples/streaming-audio) and [Microphone Input](/examples/microphone-input), and the others on [React Integration](/examples/react) and [Vue Integration](/examples/vue).

## Next Steps

Check out more examples:

- [Streaming Audio](/examples/streaming-audio) - Analyze audio streams
- [Microphone Input](/examples/microphone-input) - Real-time microphone analysis
- [React Integration](/examples/react) - Use with React
- [Vue Integration](/examples/vue) - Use with Vue
