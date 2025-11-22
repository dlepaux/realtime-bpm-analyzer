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
  audio: true 
});

// 2. Create audio context and analyzer
const audioContext = new AudioContext();
const bpmAnalyzer = await createRealtimeBpmAnalyzer(audioContext);

// 3. Connect microphone to analyzer
const source = audioContext.createMediaStreamSource(stream);
source.connect(bpmAnalyzer.node);

// 4. Listen for BPM updates
bpmAnalyzer.on('bpm', (data) => {
  console.log('Current BPM:', data.bpm[0].tempo);
});

bpmAnalyzer.on('bpmStable', (data) => {
  console.log('Stable BPM detected:', data.bpm[0].tempo);
});
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
- ✅ Low latency detection (< 100ms typical)
- ✅ Continuous BPM updates
- ✅ Works with any audio source (music, instruments, etc.)
- ✅ No recording or storage (privacy-friendly)
- ✅ Event-based API for stable BPM detection

## Privacy & Security

The microphone analysis:
- **Does not record** audio - only processes it in real-time
- **Does not store** any audio data
- **Runs entirely in the browser** - no data sent to servers
- Requires explicit user permission via browser prompt

## Next Steps

- [Basic Usage](/examples/basic-usage) - Analyze complete audio files
- [Streaming Audio](/examples/streaming-audio) - Analyze audio streams
- [React Integration](/examples/react) - Use with React
- [Vue Integration](/examples/vue) - Use with Vue
