# React Integration

How to integrate Realtime BPM Analyzer in React applications with hooks and best practices.

## Live Examples

We've built complete React examples demonstrating different use cases. Each is a fully functional application you can interact with:

### Basic File Upload

Upload and analyze audio files to detect their BPM.

<ExampleEmbed example="04-react-basic" height="500px" />

::: tip View Source
Full source: [`examples/04-react-basic`](https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/examples/04-react-basic)
:::

### Streaming Audio

Analyze BPM from live audio streams or URLs.

<ExampleEmbed example="05-react-streaming" height="600px" />

::: tip View Source
Full source: [`examples/05-react-streaming`](https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/examples/05-react-streaming)
:::

### Microphone Input

Real-time BPM detection from your microphone.

<ExampleEmbed example="06-react-microphone" height="500px" />

::: tip View Source
Full source: [`examples/06-react-microphone`](https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/examples/06-react-microphone)
:::

## Installation

```bash
npm install realtime-bpm-analyzer
```

## Key Concepts for React

### 1. Use State for Audio Context

Create and store the audio context in component state to reuse it:

```typescript
const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
const [bpmAnalyzer, setBpmAnalyzer] = useState<BpmAnalyzer | null>(null);
```

### 2. Cleanup in useEffect

Always cleanup audio nodes when component unmounts:

```typescript
useEffect(() => {
  return () => {
    bpmAnalyzer?.disconnect();
    audioContext?.close();
  };
}, []); // Empty deps - cleanup only on unmount
```

### 3. Handle Events with State Updates

Convert BPM events to React state updates:

```typescript
bpmAnalyzer.on('bpmStable', (data) => {
  if (data.bpm.length > 0) {
    setCurrentBpm(data.bpm[0].tempo);
  }
});
```

## Basic Pattern

Here's the essential pattern for any React integration:

```typescript
import { createRealtimeBpmAnalyzer } from 'realtime-bpm-analyzer';
import { useState, useEffect } from 'react';

function BPMAnalyzer() {
  const [bpm, setBpm] = useState<number | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [bpmAnalyzer, setBpmAnalyzer] = useState<BpmAnalyzer | null>(null);

  const startAnalysis = async () => {
    // Create audio context
    const ctx = new AudioContext();
    setAudioContext(ctx);

    // Create analyzer
    const analyzer = await createRealtimeBpmAnalyzer(ctx);
    setBpmAnalyzer(analyzer);

    // Listen for BPM
    analyzer.on('bpmStable', (data) => {
      if (data.bpm.length > 0) {
        setBpm(data.bpm[0].tempo);
      }
    });

    // Connect your audio source here...
  };

  useEffect(() => {
    return () => {
      bpmAnalyzer?.disconnect();
      audioContext?.close();
    };
  }, []); // Cleanup only on unmount

  return (
    <div>
      <button onClick={startAnalysis}>Start Analysis</button>
      {bpm && <div>BPM: {bpm}</div>}
    </div>
  );
}
```

## TypeScript Support

The library is fully typed. Import types as needed:

```typescript
import type { BpmAnalyzer, BpmCandidates } from 'realtime-bpm-analyzer';
```

## Next Steps

- Explore the [live examples above](#live-examples) to see complete implementations
- Check out [Vue Integration](/examples/vue) for Vue.js
- Read the [API Documentation](/api/) for detailed reference
