---
title: React BPM Detection — Hook and Live Examples
description: React integration examples for realtime-bpm-analyzer, with file analysis, streaming audio and microphone input. Live demos with full source and TypeScript types.
---

# React Integration

How to integrate Realtime BPM Analyzer in React applications with hooks and best practices.

## Live Examples

We've built complete React examples demonstrating different use cases. Each is a fully functional application you can interact with:

### Basic File Analysis

Pick an audio file and analyze it in the browser to detect its BPM.

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

### 1. Keep the Audio Context in a Ref {#_1-use-state-for-audio-context}

The audio context and the analyzer are resources, not something to render.
Keep them in refs, so the cleanup sees the current ones:

<!-- typecheck: skip, a fragment of the pattern below -->
```typescript
const audioContextRef = useRef<AudioContext | null>(null);
const analyzerRef = useRef<BpmAnalyzer | null>(null);
```

### 2. Cleanup in useEffect

Always release the analyzer and the audio context when the component unmounts.
`stop()` is final, so the next start creates a new analyzer:

<!-- typecheck: skip, a fragment of the pattern below -->
```typescript
useEffect(() => {
  return () => {
    analyzerRef.current?.stop();
    audioContextRef.current?.close();
  };
}, []); // Empty deps - cleanup only on unmount
```

### 3. Handle Events with State Updates

Convert analyzer events to React state updates:

<!-- typecheck: skip, a fragment of the pattern below -->
```typescript
analyzer.on('reading', ({ bpm }) => setBpm(bpm));
analyzer.on('statechange', ({ to }) => setLocked(to.status === 'locked'));
```

## Basic Pattern

Here's the essential pattern for any React integration:

```tsx
import { createRealtimeBpmAnalyzer, type BpmAnalyzer } from 'realtime-bpm-analyzer';
import { useState, useEffect, useRef } from 'react';

function BPMAnalyzer() {
  const [bpm, setBpm] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<BpmAnalyzer | null>(null);

  const startAnalysis = async () => {
    // Create audio context
    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;

    // Create analyzer
    const analyzer = await createRealtimeBpmAnalyzer(audioContext);
    analyzerRef.current = analyzer;

    // Listen for BPM
    analyzer.on('reading', ({ bpm }) => setBpm(bpm));
    analyzer.on('statechange', ({ to }) => setLocked(to.status === 'locked'));

    // Connect your audio source to analyzer.input here...
  };

  useEffect(() => {
    return () => {
      analyzerRef.current?.stop();
      audioContextRef.current?.close();
    };
  }, []); // Cleanup only on unmount

  return (
    <div>
      <button onClick={startAnalysis}>Start Analysis</button>
      {bpm !== null && <div>BPM: {bpm}{locked ? ' (locked)' : ''}</div>}
    </div>
  );
}
```

## TypeScript Support

The library is fully typed. Import types as needed:

```typescript
import type { BpmAnalyzer, Reading, AnalyzerState } from 'realtime-bpm-analyzer';
```

## Next Steps

- Explore the [live examples above](#live-examples) to see complete implementations
- Check out [Vue Integration](/examples/vue) for Vue.js
- Read the [API Documentation](/api/) for detailed reference
