<script setup lang="ts">
import { ref, shallowRef, onMounted, onUnmounted } from 'vue';
import { analyzeFullBuffer, type Reading } from 'realtime-bpm-analyzer';
import ReadingPanel from './reading-panel.vue';

const reading = shallowRef<Reading | null>(null);
const progressText = ref<string | undefined>();
const error = ref<string | undefined>();

let audioContext: AudioContext | null = null;

onMounted(() => {
  audioContext = new AudioContext();
});

onUnmounted(() => {
  audioContext?.close();
});

const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  reading.value = null;
  error.value = undefined;

  try {
    if (!audioContext) throw new Error('Audio context not initialized');

    // Decode the file. A format the browser can't decode rejects here, with an EncodingError.
    progressText.value = 'Decoding...';
    const audioBuffer = await audioContext.decodeAudioData(await file.arrayBuffer());

    // Analyze the whole buffer at once: the same reading a live analyzer reports, or null when no tempo was found
    progressText.value = 'Analyzing...';
    const result = await analyzeFullBuffer(audioBuffer);

    if (result === null) {
      error.value = 'No clear tempo found in this file';
    } else {
      reading.value = result;
    }
  } catch (err) {
    console.error('Error analyzing audio:', err);
    error.value = describeError(err);
  } finally {
    progressText.value = undefined;
  }
};

function describeError(err: unknown): string {
  if (err instanceof DOMException && err.name === 'EncodingError') {
    return 'This file could not be decoded. Try an MP3, WAV, OGG or FLAC file.';
  }

  return err instanceof Error ? err.message : 'Failed to analyze audio';
}
</script>

<template>
  <div class="bpm-analyzer">
    <div class="file-input-wrapper">
      <input
        type="file"
        accept="audio/*"
        @change="handleFileChange"
        :disabled="progressText !== undefined"
        class="file-input"
      />
    </div>

    <div v-if="error" class="status error">
      {{ error }}
    </div>

    <div v-if="progressText" class="status analyzing">
      {{ progressText }}
    </div>

    <div v-if="reading" class="status success">
      Analysis complete!
    </div>

    <ReadingPanel v-if="reading" :reading="reading" />
  </div>
</template>

<style scoped>
.bpm-analyzer {
  width: 100%;
}

.file-input-wrapper {
  margin-bottom: 20px;
}

.file-input {
  width: 100%;
  padding: 15px;
  border: 2px dashed #667eea;
  border-radius: 10px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s ease;
  background: white;
}

.file-input:hover:not(:disabled) {
  border-color: #764ba2;
  background: #f8f9ff;
}

.file-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.status {
  padding: 15px;
  border-radius: 10px;
  margin-bottom: 20px;
  font-size: 14px;
  text-align: center;
}

.status.analyzing {
  background: #fff3cd;
  color: #856404;
  border: 1px solid #ffeaa7;
}

.status.success {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.status.error {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

</style>
