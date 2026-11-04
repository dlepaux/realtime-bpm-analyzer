---
title: Vue 3 BPM Detection — Composition API Examples
description: Vue 3 integration examples for realtime-bpm-analyzer — file, streaming, and microphone BPM detection with the Composition API. Live demos and source code.
---

# Vue Integration

How to integrate Realtime BPM Analyzer in Vue 3 applications using the Composition API.

## Live Examples

We've built complete Vue 3 examples demonstrating different use cases. Each is a fully functional application you can interact with:

### Basic File Analysis

Pick an audio file and analyze it in the browser to detect its BPM.

<ExampleEmbed example="07-vue-basic" height="500px" />

::: tip View Source
Full source: [`examples/07-vue-basic`](https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/examples/07-vue-basic)
:::

### Streaming Audio

Analyze BPM from live audio streams or URLs.

<ExampleEmbed example="08-vue-streaming" height="600px" />

::: tip View Source
Full source: [`examples/08-vue-streaming`](https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/examples/08-vue-streaming)
:::

### Microphone Input

Real-time BPM detection from your microphone.

<ExampleEmbed example="09-vue-microphone" height="500px" />

::: tip View Source
Full source: [`examples/09-vue-microphone`](https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/examples/09-vue-microphone)
:::

## Installation

```bash
npm install realtime-bpm-analyzer
```

## Key Concepts for Vue

### 1. Use Refs for Reactive State

Store the BPM in a Vue ref. The audio context and the analyzer are resources,
not state to render, so plain variables do:

<!-- typecheck: skip, a fragment of the pattern below -->
```typescript
import { ref } from 'vue';

const bpm = ref<number | null>(null);
let audioContext: AudioContext | null = null;
let analyzer: BpmAnalyzer | null = null;
```

### 2. Cleanup with onUnmounted

Always release the analyzer and the audio context when the component unmounts.
`stop()` is final, so the next start creates a new analyzer:

<!-- typecheck: skip, a fragment of the pattern below -->
```typescript
import { onUnmounted } from 'vue';

onUnmounted(() => {
  analyzer?.stop();
  audioContext?.close();
});
```

### 3. Handle Events with Ref Updates

Convert analyzer events to reactive updates:

<!-- typecheck: skip, a fragment of the pattern below -->
```typescript
analyzer.on('reading', ({ bpm: value }) => {
  bpm.value = value;
});
```

## Basic Pattern

Here's the essential pattern for Vue integration using Composition API:

```vue
<script setup lang="ts">
import { ref, onUnmounted } from 'vue';
import { createRealtimeBpmAnalyzer, type BpmAnalyzer } from 'realtime-bpm-analyzer';

const bpm = ref<number | null>(null);
const locked = ref(false);
let audioContext: AudioContext | null = null;
let analyzer: BpmAnalyzer | null = null;

const startAnalysis = async () => {
  // Create audio context
  audioContext = new AudioContext();
  await audioContext.resume();

  // Create analyzer
  analyzer = await createRealtimeBpmAnalyzer(audioContext);

  // Listen for BPM
  analyzer.on('reading', ({ bpm: value }) => {
    bpm.value = value;
  });
  analyzer.on('statechange', ({ to }) => {
    locked.value = to.status === 'locked';
  });

  // Connect your audio source to analyzer.input here...
};

onUnmounted(() => {
  analyzer?.stop();
  audioContext?.close();
});
</script>

<template>
  <div>
    <button @click="startAnalysis">Start Analysis</button>
    <div v-if="bpm !== null">BPM: {{ bpm }}{{ locked ? ' (locked)' : '' }}</div>
  </div>
</template>
```

## Composables Pattern

You can create a reusable composable for BPM analysis:

```typescript
// composables/useBpmAnalyzer.ts
import { ref, onUnmounted } from 'vue';
import { createRealtimeBpmAnalyzer, type BpmAnalyzer } from 'realtime-bpm-analyzer';

export function useBpmAnalyzer() {
  const bpm = ref<number | null>(null);
  const isAnalyzing = ref(false);

  let analyzer: BpmAnalyzer | null = null;

  // The source must belong to the same audio context: the caller owns both.
  const start = async (audioContext: AudioContext, source: AudioNode) => {
    analyzer = await createRealtimeBpmAnalyzer(audioContext);
    source.connect(analyzer.input);

    analyzer.on('reading', ({ bpm: value }) => {
      bpm.value = value;
    });

    isAnalyzing.value = true;
  };

  // stop() is final: the next start creates a new analyzer.
  const stop = () => {
    analyzer?.stop();
    analyzer = null;
    isAnalyzing.value = false;
  };

  onUnmounted(stop);

  return { bpm, isAnalyzing, start, stop };
}
```

## TypeScript Support

The library is fully typed. Import types as needed:

```typescript
import type { BpmAnalyzer, Reading, AnalyzerState } from 'realtime-bpm-analyzer';
```

## Next Steps

- Explore the [live examples above](#live-examples) to see complete implementations
- Check out [React Integration](/examples/react) for React
- Read the [API Documentation](/api/) for detailed reference
