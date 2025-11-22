# Basic Usage

This guide demonstrates how to analyze BPM from audio files using Realtime BPM Analyzer.

## Live Demo

Try the interactive demo below - this is the **actual vanilla JavaScript example** running. You can upload your own audio files to see it in action!

<ExampleEmbed example="01-vanilla-basic" height="500px" />

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
const tempos = await analyzeFullBuffer(audioBuffer);

// 4. Get the detected BPM
const bpm = tempos[0].tempo;
console.log(`Detected BPM: ${bpm}`);
```

This approach analyzes the **complete audio file** at once, making it perfect for:
- Music library organization
- DJ applications  
- Fitness apps
- Any scenario where you need the tempo of a complete song

## Next Steps

Check out more examples:

- [Streaming Audio](/examples/streaming-audio) - Analyze audio streams
- [Microphone Input](/examples/microphone-input) - Real-time microphone analysis
- [React Integration](/examples/react) - Use with React
- [Vue Integration](/examples/vue) - Use with Vue
