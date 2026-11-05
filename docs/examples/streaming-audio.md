---
title: BPM from Live Audio Stream — Radio and Online Music
description: Detect BPM from any live audio stream — radio stations, online music, podcasts — in real time in the browser. Live demo with full vanilla JavaScript source.
---

# Streaming Audio BPM Detection

Analyze the BPM of live audio streams like radio stations or online music services in real-time.

## Live Demo

Try the interactive demo below - this is the **actual vanilla JavaScript streaming example** running. Paste any audio stream URL to analyze it!

<ExampleEmbed example="02-vanilla-streaming" height="550px" />

::: tip View Source Code
The complete source code for this example is available in the [`examples/02-vanilla-streaming`](https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/examples/02-vanilla-streaming) directory.
:::

## How It Works

Streaming analysis uses the same real-time approach as microphone input, but connects to an audio element instead:

```typescript
import { createRealtimeBpmAnalyzer } from 'realtime-bpm-analyzer';

// 1. Create audio context and analyzer
const audioContext = new AudioContext();
const analyzer = await createRealtimeBpmAnalyzer(audioContext, {
  // Start the analysis over every 20 s of audio, so the reading follows
  // the music as one song gives way to the next
  engine: { name: 'peaks', restartAfterSeconds: 20 },
});

// 2. Connect the audio element to the analyzer's input, and to the speakers
const audioElement = document.querySelector('audio')!;
audioElement.crossOrigin = 'anonymous'; // the stream server must allow CORS
const source = audioContext.createMediaElementSource(audioElement);
source.connect(analyzer.input);
source.connect(audioContext.destination);

// 3. Listen for BPM updates
analyzer.on('reading', ({ bpm }) => {
  console.log('Current BPM:', bpm);
});

// 4. Start playing the stream
audioElement.src = 'https://stream-url.com/audio';
await audioElement.play();
```

## Use Cases

This approach is ideal for:
- **Live radio monitoring** - Track BPM of radio stations in real-time
- **Streaming services** - Analyze music from online audio sources
- **DJ applications** - Monitor multiple streams simultaneously
- **Audio monitoring tools** - Build dashboards for live audio analysis

## Key Features

- ✅ Real-time stream analysis
- ✅ Works with HTTP/HTTPS audio streams
- ✅ Continuous BPM updates
- ✅ Supports common streaming formats (MP3, AAC, etc.)

## Next Steps

- [Microphone Input](/examples/microphone-input) - Analyze audio from your microphone
- [React Integration](/examples/react) - Use with React
- [Vue Integration](/examples/vue) - Use with Vue
