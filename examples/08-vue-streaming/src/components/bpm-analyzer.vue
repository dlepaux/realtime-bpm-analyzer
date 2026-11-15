<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import {
  createRealtimeBpmAnalyzer,
  type BpmAnalyzer
} from 'realtime-bpm-analyzer';
import ReadingPanel from './reading-panel.vue';
import StatePanel from './state-panel.vue';
import { useAnalyzerView } from './use-analyzer-view';

const audioUrl = ref('https://ice1.somafm.com/groovesalad-128-mp3');
const isLoaded = ref(false);
const isPlaying = ref(false);
const isLoading = ref(false);
const error = ref<string>();
const { view, watchAnalyzer } = useAnalyzerView();

// The reading panel shows while settling or locked, with the status it was read in
const liveReading = computed(() => {
  const current = view.value;
  if (!current?.reading) return null;
  const { status } = current.state;
  return status === 'settling' || status === 'locked' ? { reading: current.reading, status } : null;
});

let audioContext: AudioContext | null = null;
let audioElement: HTMLAudioElement | null = null;
let mediaSource: MediaElementAudioSourceNode | null = null;
let bpmAnalyzer: BpmAnalyzer | null = null;

// Initialize audio context
audioContext = new AudioContext();

const cleanup = () => {
  if (audioElement) {
    audioElement.pause();
    audioElement.src = '';
    audioElement = null;
  }

  if (mediaSource) {
    mediaSource.disconnect();
    mediaSource = null;
  }

  if (bpmAnalyzer) {
    // stop() is final: the state panel shows the move to stopped, and the next load creates a new analyzer
    bpmAnalyzer.stop();
    bpmAnalyzer.disconnect();
    bpmAnalyzer = null;
  }

  isLoaded.value = false;
  isPlaying.value = false;
};

const handleLoad = async () => {
  if (!audioUrl.value.trim()) {
    error.value = 'Please enter a valid URL';
    return;
  }

  try {
    cleanup();
    isLoading.value = true;
    error.value = undefined;

    if (!audioContext) throw new Error('Audio context not initialized');

    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    // Create audio element
    const element = new Audio(audioUrl.value);
    element.crossOrigin = 'anonymous';
    audioElement = element;

    // Create BPM analyzer, and show what it reports
    const analyzer = await createRealtimeBpmAnalyzer(audioContext);
    bpmAnalyzer = analyzer;
    watchAnalyzer(analyzer);

    // Create media source and connect
    mediaSource = audioContext.createMediaElementSource(element);

    // The analyzer's input holds what the engine needs in front of it
    mediaSource.connect(analyzer.input);
    mediaSource.connect(audioContext.destination);

    // Wait for audio to be ready
    await new Promise<void>((resolve, reject) => {
      element.addEventListener('canplay', () => resolve(), { once: true });
      element.addEventListener('error', () => reject(new Error('The audio could not be loaded')), { once: true });
    });

    isLoaded.value = true;
    isLoading.value = false;
  } catch (err) {
    console.error('Error loading audio:', err);
    error.value = err instanceof Error ? err.message : 'Failed to load audio';
    isLoading.value = false;
    cleanup();
  }
};

const handlePlay = async () => {
  if (!audioElement) return;

  try {
    if (audioContext?.state === 'suspended') {
      await audioContext.resume();
    }
    await audioElement.play();
    isPlaying.value = true;
  } catch (err) {
    console.error('Error playing audio:', err);
    error.value = 'Failed to play audio';
  }
};

// The analyzer hears silence, and after a couple of seconds moves to listening (pulse-lost)
const handlePause = () => {
  if (!audioElement) return;
  audioElement.pause();
  isPlaying.value = false;
};

// Start over: back to listening with the next epoch, and nothing measured before is reported
const handleReset = () => {
  if (bpmAnalyzer && bpmAnalyzer.state.status !== 'stopped') {
    bpmAnalyzer.reset();
  }
};

const handleStop = () => {
  cleanup();
  error.value = undefined;
};

onUnmounted(() => {
  cleanup();
  audioContext?.close();
});
</script>

<template>
  <div class="bpm-analyzer">
    <div class="input-group">
      <label for="audioUrl">Audio Stream URL:</label>
      <input
        type="url"
        id="audioUrl"
        v-model="audioUrl"
        :disabled="isLoading"
        placeholder="https://example.com/stream.mp3"
      />
      <button
        @click="handleLoad"
        :disabled="isLoading"
        class="load-btn"
      >
        {{ isLoading ? 'Loading...' : 'Load Stream' }}
      </button>
    </div>

    <div class="controls">
      <button @click="handlePlay" :disabled="!isLoaded || isPlaying">
        ▶ Play
      </button>
      <button @click="handlePause" :disabled="!isLoaded || !isPlaying">
        ⏸ Pause
      </button>
      <button @click="handleReset" :disabled="!isLoaded">
        ↺ Start over
      </button>
      <button @click="handleStop" :disabled="!isLoaded">
        ⏹ Stop
      </button>
    </div>

    <div v-if="error" class="status error">
      {{ error }}
    </div>

    <div v-if="isLoading" class="status analyzing">
      Loading audio stream...
    </div>

    <div v-if="!error && isLoaded" class="status playing">
      {{ isPlaying ? 'Playing and analyzing...' : 'Audio loaded - ready to play!' }}
    </div>

    <StatePanel v-if="view" :state="view.state" :changes="view.changes" :last-error="view.lastError" />

    <ReadingPanel v-if="liveReading" :reading="liveReading.reading" :status="liveReading.status" />
  </div>
</template>

<style scoped>
.bpm-analyzer {
  width: 100%;
}

.input-group {
  margin-bottom: 20px;
}

label {
  display: block;
  margin-bottom: 8px;
  color: #555;
  font-size: 14px;
  font-weight: 500;
}

input[type="url"] {
  width: 100%;
  padding: 12px;
  border: 2px solid #e0e0e0;
  border-radius: 10px;
  font-size: 14px;
  transition: all 0.3s ease;
  margin-bottom: 10px;
}

input[type="url"]:focus {
  outline: none;
  border-color: #667eea;
}

button {
  padding: 12px 24px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.load-btn {
  width: 100%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.load-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
}

.controls {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.controls button {
  flex: 1;
  background: #f0f0f0;
  color: #333;
}

.controls button:hover:not(:disabled) {
  background: #e0e0e0;
}

button:disabled {
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

.status.playing {
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
