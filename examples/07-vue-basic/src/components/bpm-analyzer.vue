<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { analyzeFullBuffer } from 'realtime-bpm-analyzer';

const bpm = ref<number | undefined>();
const isAnalyzing = ref(false);
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

  try {
    isAnalyzing.value = true;
    error.value = undefined;
    bpm.value = undefined;

    if (!audioContext) throw new Error('Audio context not initialized');

    // Resume audio context if suspended
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    // Read and decode audio file
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Analyze the full buffer to get BPM candidates
    const tempos = await analyzeFullBuffer(audioBuffer);

    // Get the top BPM candidate
    const topTempo = tempos[0];

    if (topTempo) {
      bpm.value = topTempo.tempo;
      isAnalyzing.value = false;
    } else {
      error.value = 'Could not detect BPM';
      isAnalyzing.value = false;
    }
  } catch (err) {
    console.error('Error analyzing audio:', err);
    error.value = err instanceof Error ? err.message : 'Failed to analyze audio';
    isAnalyzing.value = false;
  }
};
</script>

<template>
  <div class="bpm-analyzer">
    <div class="file-input-wrapper">
      <input
        type="file"
        accept="audio/*"
        @change="handleFileChange"
        :disabled="isAnalyzing"
        class="file-input"
      />
    </div>

    <div v-if="error" class="status error">
      {{ error }}
    </div>

    <div v-if="isAnalyzing" class="status analyzing">
      Analyzing audio...
    </div>

    <div v-if="!error && !isAnalyzing && bpm !== undefined" class="status success">
      Analysis complete!
    </div>

    <div class="bpm-display" :class="{ visible: bpm !== undefined }">
      <div class="bpm-value">{{ bpm !== undefined ? Math.round(bpm) : '--' }}</div>
      <div class="bpm-label">BPM</div>
    </div>
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

.bpm-display {
  text-align: center;
  padding: 30px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 15px;
  opacity: 0;
  transform: translateY(10px);
  transition: all 0.5s ease;
}

.bpm-display.visible {
  opacity: 1;
  transform: translateY(0);
}

.bpm-value {
  font-size: 64px;
  font-weight: bold;
  color: white;
  margin-bottom: 5px;
}

.bpm-label {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.9);
  text-transform: uppercase;
  letter-spacing: 2px;
}
</style>
