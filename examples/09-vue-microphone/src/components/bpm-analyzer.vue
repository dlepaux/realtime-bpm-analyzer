<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import {
  createRealtimeBpmAnalyzer,
  type BpmAnalyzer
} from 'realtime-bpm-analyzer';
import ReadingPanel from './reading-panel.vue';
import StatePanel from './state-panel.vue';
import { useAnalyzerView } from './use-analyzer-view';

const isRecording = ref(false);
const error = ref<string>();
const { view, watchAnalyzer } = useAnalyzerView();

// The reading panel shows while settling or locked, with the status it was read in
const liveReading = computed(() => {
  const current = view.value;
  if (!current?.reading) return null;
  const { status } = current.state;
  return status === 'settling' || status === 'locked' ? { reading: current.reading, status } : null;
});

let mediaStream: MediaStream | null = null;
let source: MediaStreamAudioSourceNode | null = null;
let bpmAnalyzer: BpmAnalyzer | null = null;

// Initialize audio context
const audioContext = new AudioContext();

const stopListening = async () => {
  if (bpmAnalyzer) {
    // stop() is final: the state panel shows the move to stopped, and the next start creates a new analyzer
    bpmAnalyzer.stop();
    bpmAnalyzer.disconnect();
    bpmAnalyzer = null;
  }

  if (source) {
    source.disconnect();
    source = null;
  }

  // Stop microphone tracks so the browser releases the device
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }

  isRecording.value = false;
  await audioContext.suspend();
};

const handleStream = async (audioCtx: AudioContext, stream: MediaStream) => {
  // A suspended context (after a stop) delivers no audio
  await audioCtx.resume();

  const [track] = stream.getAudioTracks();
  if (!track) {
    throw new Error('The microphone gave no audio track.');
  }

  // liveInput: the analyzer follows the track's clock, and moves to listening with reason audio-lost while
  // the browser is losing input
  const analyzer = await createRealtimeBpmAnalyzer(audioCtx, { liveInput: track });
  bpmAnalyzer = analyzer;
  watchAnalyzer(analyzer);

  // Create media stream source and connect it to the analyzer's input
  const mediaStreamSource = audioCtx.createMediaStreamSource(stream);
  source = mediaStreamSource;
  mediaStreamSource.connect(analyzer.input);
};

const handleStart = async () => {
  try {
    error.value = undefined;

    // Request microphone access
    // Disable the voice-mode filters. Echo cancellation removes audio coming
    // from the device's own speakers, which silences music played on the same
    // device; noise suppression and auto gain control distort the beat.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
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
    await stopListening();
  }
};

// Start over: back to listening with the next epoch, and nothing measured before is reported
const handleReset = () => {
  if (bpmAnalyzer && bpmAnalyzer.state.status !== 'stopped') {
    bpmAnalyzer.reset();
  }
};

const handleStop = () => {
  void stopListening();
};

onUnmounted(() => {
  void stopListening().finally(() => audioContext.close());
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
      <button @click="handleReset" :disabled="!isRecording">
        ↺ Start over
      </button>
      <button @click="handleStop" :disabled="!isRecording">
        ⏹ Stop
      </button>
    </div>

    <div v-if="error" class="status error">
      {{ error }}
    </div>

    <div v-if="isRecording && !error" class="status success">
      Listening for music - play something!
    </div>

    <StatePanel v-if="view" :state="view.state" :changes="view.changes" :last-error="view.lastError" />

    <ReadingPanel v-if="liveReading" :reading="liveReading.reading" :status="liveReading.status" />
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

</style>
