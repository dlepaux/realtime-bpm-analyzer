# Vue Integration

How to integrate Realtime BPM Analyzer in Vue 3 applications using Composition API.

## Installation

```bash
npm install realtime-bpm-analyzer
```

## Composable Pattern

Create a reusable composable at `composables/useBPMAnalyzer.ts`:

```typescript
import { ref, onUnmounted } from 'vue';
import { createRealtimeBpmAnalyzer, type BpmAnalyzer } from 'realtime-bpm-analyzer';

export function useBPMAnalyzer() {
  const bpm = ref(0);
  const isAnalyzing = ref(false);
  
  let audioContext: AudioContext | null = null;
  let bpmAnalyzer: BpmAnalyzer | null = null;

  const startAnalysis = async (audioElement: HTMLAudioElement) => {
    try {
      audioContext = new AudioContext();
      await audioContext.resume();
      
      bpmAnalyzer = await createRealtimeBpmAnalyzer(audioContext);
      const source = audioContext.createMediaElementSource(audioElement);
      
      // Connect audio graph - use .node for audio connections
      source.connect(bpmAnalyzer.node);
      bpmAnalyzer.node.connect(audioContext.destination);
      
      // Use typed event listeners
      bpmAnalyzer.on('bpmStable', (data) => {
        bpm.value = data.bpm[0]?.tempo || 0;
      });
      
      isAnalyzing.value = true;
    } catch (error) {
      console.error('Failed to start analysis:', error);
    }
  };

  const stopAnalysis = async () => {
    if (audioContext) {
      await audioContext.close();
      audioContext = null;
      analyzerNode = null;
      isAnalyzing.value = false;
      bpm.value = 0;
    }
  };

  onUnmounted(() => {
    stopAnalysis();
  });

  return {
    bpm,
    isAnalyzing,
    startAnalysis,
    stopAnalysis
  };
}
```

## Component Usage

```vue
<template>
  <div class="bpm-analyzer">
    <audio ref="audioElement" src="/audio/song.mp3" />
    
    <button @click="handlePlay" :disabled="isAnalyzing">
      {{ isAnalyzing ? 'Analyzing...' : 'Play & Analyze' }}
    </button>
    
    <button @click="stopAnalysis" :disabled="!isAnalyzing">
      Stop
    </button>
    
    <div v-if="isAnalyzing" class="result">
      <p>BPM: {{ bpm || 'Detecting...' }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useBPMAnalyzer } from '@/composables/useBPMAnalyzer';

const audioElement = ref<HTMLAudioElement>();
const { bpm, isAnalyzing, startAnalysis, stopAnalysis } = useBPMAnalyzer();

const handlePlay = async () => {
  if (audioElement.value) {
    await startAnalysis(audioElement.value);
    audioElement.value.play();
  }
};
</script>
```

## TypeScript Support

For full type safety:

```typescript
import type { Ref } from 'vue';
import type { BpmCandidates } from 'realtime-bpm-analyzer';

interface BPMAnalyzerComposable {
  bpm: Ref<number>;
  isAnalyzing: Ref<boolean>;
  startAnalysis: (audio: HTMLAudioElement) => Promise<void>;
  stopAnalysis: () => Promise<void>;
}
```

## Vite Configuration

If using Vite, ensure proper asset handling in `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  assetsInclude: ['**/*.mp3', '**/*.wav', '**/*.flac']
});
```

## Key Points

- ✅ Use Composition API for cleaner code
- ✅ Clean up in `onUnmounted` hook
- ✅ Use `ref` for reactive BPM values
- ✅ Start AudioContext after user interaction
- ❌ Don't create multiple analyzers for the same source

## Complete Examples

All our examples use Vue components:
- [Microphone Input](/examples/microphone-input) - Full Vue 3 example
- [File Upload](/examples/file-upload) - Batch processing
- [Streaming Audio](/examples/streaming-audio) - Online streams

## Next Steps

- [React Integration](/examples/react) - React hooks pattern
- [Next.js Integration](/examples/nextjs) - SSR considerations
- [API Reference](/api/) - Full documentation
