<script setup lang="ts">
import { ref, onUnmounted } from 'vue';
import { 
  createRealtimeBpmAnalyzer, 
  getBiquadFilter, 
  type BpmAnalyzer, 
  type BpmCandidates 
} from 'realtime-bpm-analyzer';

const bpm = ref<number>();
const audioUrl = ref('https://ice1.somafm.com/groovesalad-128-mp3');
const isPlaying = ref(false);
const isLoading = ref(false);
const error = ref<string>();

let audioContext: AudioContext | null = null;
let audioElement: HTMLAudioElement | null = null;
let mediaSource: MediaElementAudioSourceNode | null = null;
let bpmAnalyzer: BpmAnalyzer | null = null;
let biquadFilter: BiquadFilterNode | null = null;

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

  if (biquadFilter) {
    biquadFilter.disconnect();
    biquadFilter = null;
  }

  if (bpmAnalyzer) {
    bpmAnalyzer.disconnect();
    bpmAnalyzer = null;
  }

  isPlaying.value = false;
  bpm.value = undefined;
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
    audioElement = new Audio(audioUrl.value);
    audioElement.crossOrigin = 'anonymous';

    // Create BPM analyzer
    const analyzer = await createRealtimeBpmAnalyzer(audioContext);
    bpmAnalyzer = analyzer;

    // Create biquad filter
    const filter = getBiquadFilter(audioContext);
    biquadFilter = filter;

    // Listen for BPM stable events
    analyzer.on('bpmStable', (data: BpmCandidates) => {
      if (data.bpm.length > 0) {
        bpm.value = data.bpm[0].tempo;
      }
    });

    // Create media source and connect
    const source = audioContext.createMediaElementSource(audioElement);
    mediaSource = source;

    source.connect(filter);
    filter.connect(analyzer.node);
    source.connect(audioContext.destination);

    // Wait for audio to be ready
    await new Promise<void>((resolve, reject) => {
      audioElement!.addEventListener('canplay', () => resolve(), { once: true });
      audioElement!.addEventListener('error', (e) => reject(e), { once: true });
    });

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

const handlePause = () => {
  if (!audioElement) return;
  audioElement.pause();
  isPlaying.value = false;
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
      <button 
        @click="handlePlay" 
        :disabled="!audioElement || isPlaying"
      >
        ▶ Play
      </button>
      <button 
        @click="handlePause" 
        :disabled="!audioElement || !isPlaying"
      >
        ⏸ Pause
      </button>
      <button 
        @click="handleStop" 
        :disabled="!audioElement"
      >
        ⏹ Stop
      </button>
    </div>

    <div v-if="error" class="status error">
      {{ error }}
    </div>

    <div v-if="isLoading" class="status analyzing">
      Loading audio stream...
    </div>

    <div v-if="!error && !isLoading && isPlaying" class="status playing">
      Playing and analyzing...
    </div>

    <div v-if="!error && !isLoading && audioElement && !isPlaying" class="status playing">
      Audio loaded - ready to play!
    </div>

    <div :class="['bpm-display', { visible: bpm !== undefined }]">
      <div class="bpm-value">{{ bpm !== undefined ? Math.round(bpm) : '--' }}</div>
      <div class="bpm-label">BPM</div>
    </div>
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
