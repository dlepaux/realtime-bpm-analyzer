---
title: Detect BPM from Microphone — Live Demo and Code
description: Live demo and full source for detecting BPM from a microphone in real time. Uses getUserMedia plus AudioWorklet. Works on desktop and mobile browsers.
---

# Microphone Input BPM Detection

Detect BPM in real-time using your device's microphone. Perfect for analyzing music playing around you or for live performance tools.

## Live Demo

Try the interactive demo below - this is the **actual vanilla JavaScript microphone example** running. Click "Start" and allow microphone access!

<ExampleEmbed example="03-vanilla-microphone" height="500px" />

::: warning Microphone Permission Required
Your browser will ask for microphone access. This demo works best when music is playing nearby.
:::

::: tip View Source Code
The complete source code for this example is available in the [`examples/03-vanilla-microphone`](https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/examples/03-vanilla-microphone) directory.
:::

## How It Works

Real-time microphone analysis involves a few key steps:

```typescript
import { createRealtimeBpmAnalyzer } from 'realtime-bpm-analyzer';

// 1. Request microphone access
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  },
});

// 2. Create audio context and analyzer. `liveInput` lets the analyzer
//    follow the track's clock, so audio the browser drops doesn't speed
//    the tempo up.
const [track] = stream.getAudioTracks();
const audioContext = new AudioContext();
const analyzer = await createRealtimeBpmAnalyzer(audioContext, { liveInput: track });

// 3. Connect the microphone to the analyzer's input, which holds what
//    the engine needs in front of it. Not to the speakers: that would
//    make a feedback loop.
const source = audioContext.createMediaStreamSource(stream);
source.connect(analyzer.input);

// 4. Listen for BPM updates
analyzer.on('reading', ({ bpm }) => {
  console.log('Current BPM:', bpm);
});

analyzer.on('statechange', ({ to }) => {
  if (to.status === 'locked') {
    console.log('Locked BPM:', to.reading.bpm);
  }
});

// 5. When done: stop() is final, and the tracks release the microphone
// analyzer.stop();
// stream.getTracks().forEach((t) => t.stop());
```

## Use Cases

This approach is ideal for:
- **Live performance tools** - Real-time beat detection for musicians
- **Interactive installations** - React to music playing in the environment
- **Music discovery** - Identify BPM of songs playing around you
- **Beat visualizations** - Create real-time visual effects synced to music
- **Practice tools** - Help musicians practice with a metronome

## Key Features

- ✅ Real-time microphone analysis
- ✅ Continuous BPM updates, about ten a second once the first reading is in
- ✅ Works with any audio source (music, instruments, etc.)
- ✅ No recording or storage
- ✅ A `statechange` event when the tempo locks

## Privacy & Security

The microphone analysis:
- **Does not record** audio - only processes it in real-time
- **Does not store** any audio data
- **Runs entirely in the browser**: the library sends no audio anywhere
- Requires explicit user permission via browser prompt

That covers the analysis. The page around this demo is part of the website, which measures its own pages as [Website Privacy](/website-privacy) describes.

## Next Steps

- [Basic Usage](/examples/basic-usage) - Analyze complete audio files
- [Streaming Audio](/examples/streaming-audio) - Analyze audio streams
- [React Integration](/examples/react) - Use with React
- [Vue Integration](/examples/vue) - Use with Vue
