<script setup lang="ts">
import { ref, onUnmounted } from 'vue';
import { 
  createRealtimeBpmAnalyzer, 
  type BpmAnalyzer, 
  type BpmCandidates 
} from 'realtime-bpm-analyzer';

const bpm = ref<number>();
const isRecording = ref(false);
const error = ref<string>();

let audioContext: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
let source: MediaStreamAudioSourceNode | null = null;
let bpmAnalyzer: BpmAnalyzer | null = null;
let analyser: AnalyserNode | null = null;

// Initialize audio context
audioContext = new AudioContext();

const disconnect = async () => {
  if (!audioContext || !source || !bpmAnalyzer || !analyser) {
    return;
  }

  await audioContext.suspend();

  source.disconnect();
  analyser.disconnect();
  bpmAnalyzer.disconnect();

  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }

  isRecording.value = false;
  bpm.value = undefined;
};

const handleStream = async (audioCtx: AudioContext, stream: MediaStream) => {
  await audioCtx.resume();

  // Create BPM analyzer
  const analyzer = await createRealtimeBpmAnalyzer(audioCtx);
  bpmAnalyzer = analyzer;

  // Create analyser node
  const analyserNode = audioCtx.createAnalyser();
  analyserNode.fftSize = 2048;
  analyser = analyserNode;

  // Create media stream source
  const mediaStreamSource = audioCtx.createMediaStreamSource(stream);
  source = mediaStreamSource;

  // Connect everything together
  mediaStreamSource.connect(analyserNode);
  mediaStreamSource.connect(analyzer.node);

  // Setup event listeners
  analyzer.on('bpmStable', (data: BpmCandidates) => {
    if (data.bpm.length > 0) {
      bpm.value = data.bpm[0].tempo;
    }
  });
};

const handleStart = async () => {
  try {
    error.value = undefined;

    if (!audioContext) throw new Error('Audio context not initialized');

    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    // Request microphone access
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStream = stream;

    await handleStream(audioContext, stream);

    isRecording.value = true;
  } catch (err) {
    console.error('Error accessing microphone:', err);
    
    let errorMessage = 'Failed to access microphone';
    if (err instanceof Error) {
      if (err.name === 'NotAllowedError') {
        errorMessage = 'Microphone access denied. Please allow microphone access.';
      } else if (err.name === 'NotFoundError') {
        errorMessage = 'No microphone found. Please connect a microphone.';
      } else {
        errorMessage = err.message;
      }
    }
    
    error.value = errorMessage;
  }
};

const handleStop = () => {
  disconnect();
};

onUnmounted(() => {
  disconnect();
  audioContext?.close();
});
</script>

<template>
  <div class="bpm-analyzer">
    <div class="controls">
      <button 
        @click="handleStart" 
        :disabled="isRecording"
        class="start-btn"
      >
        🎤 Start Recording
      </button>
      <button 
        @click="handleStop" 
        :disabled="!isRecording"
      >
        ⏹ Stop
      </button>
    </div>

    <div v-if="error" class="status error">
      {{ error }}
    </div>

    <div v-if="isRecording && !error" class="status success">
      Listening for music - play something!
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

.controls {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

button {
  flex: 1;
  padding: 15px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.start-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.start-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
}

.controls button:not(.start-btn) {
  background: #f0f0f0;
  color: #333;
}

.controls button:not(.start-btn):hover:not(:disabled) {
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
