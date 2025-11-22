# Vue Integration

How to integrate Realtime BPM Analyzer in Vue 3 applications using the Composition API.

## Live Examples

We've built complete Vue 3 examples demonstrating different use cases. Each is a fully functional application you can interact with:

### Basic File Upload

Upload and analyze audio files to detect their BPM.

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

Store BPM and analyzer state in Vue refs:

```typescript
import { ref } from 'vue';

const bpm = ref<number>(0);
const audioContext = ref<AudioContext | null>(null);
const bpmAnalyzer = ref<BpmAnalyzer | null>(null);
```

### 2. Cleanup with onUnmounted

Always cleanup audio nodes when component unmounts:

```typescript
import { onUnmounted } from 'vue';

onUnmounted(() => {
  bpmAnalyzer.value?.disconnect();
  audioContext.value?.close();
});
```

### 3. Handle Events with Ref Updates

Convert BPM events to reactive updates:

```typescript
bpmAnalyzer.value?.on('bpmStable', (data) => {
  if (data.bpm.length > 0) {
    bpm.value = data.bpm[0].tempo;
  }
});
```

## Basic Pattern

Here's the essential pattern for Vue integration using Composition API:

```vue
<script setup lang="ts">
import { ref, onUnmounted } from 'vue';
import { createRealtimeBpmAnalyzer, type BpmAnalyzer } from 'realtime-bpm-analyzer';

const bpm = ref<number>(0);
const audioContext = ref<AudioContext | null>(null);
const bpmAnalyzer = ref<BpmAnalyzer | null>(null);

const startAnalysis = async () => {
  // Create audio context
  audioContext.value = new AudioContext();
  await audioContext.value.resume();

  // Create analyzer
  bpmAnalyzer.value = await createRealtimeBpmAnalyzer(audioContext.value);

  // Listen for BPM
  bpmAnalyzer.value.on('bpmStable', (data) => {
    if (data.bpm.length > 0) {
      bpm.value = data.bpm[0].tempo;
    }
  });

  // Connect your audio source here...
};

onUnmounted(() => {
  bpmAnalyzer.value?.disconnect();
  audioContext.value?.close();
});
</script>

<template>
  <div>
    <button @click="startAnalysis">Start Analysis</button>
    <div v-if="bpm">BPM: {{ bpm }}</div>
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
  const bpm = ref<number>(0);
  const isAnalyzing = ref(false);
  
  let audioContext: AudioContext | null = null;
  let analyzer: BpmAnalyzer | null = null;

  const start = async (audioSource: AudioNode) => {
    audioContext = new AudioContext();
    analyzer = await createRealtimeBpmAnalyzer(audioContext);
    
    audioSource.connect(analyzer.node);
    
    analyzer.on('bpmStable', (data) => {
      bpm.value = data.bpm[0]?.tempo || 0;
    });
    
    isAnalyzing.value = true;
  };

  const stop = async () => {
    analyzer?.disconnect();
    await audioContext?.close();
    isAnalyzing.value = false;
  };

  onUnmounted(() => stop());

  return { bpm, isAnalyzing, start, stop };
}
```

## TypeScript Support

The library is fully typed. Import types as needed:

```typescript
import type { BpmAnalyzer, BpmCandidates } from 'realtime-bpm-analyzer';
```

## Next Steps

- Explore the [live examples above](#live-examples) to see complete implementations
- Check out [React Integration](/examples/react) for React
- Read the [API Documentation](/api/) for detailed reference
