import { createRealtimeBpmAnalyzer, type BpmAnalyzer, type BpmCandidates } from 'realtime-bpm-analyzer';

// Get DOM elements
const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
const statusElement = document.getElementById('status') as HTMLDivElement;
const bpmDisplay = document.getElementById('bpmDisplay') as HTMLDivElement;
const bpmValue = document.getElementById('bpmValue') as HTMLDivElement;

// State
let audioContext: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
let source: MediaStreamAudioSourceNode | null = null;
let bpmAnalyzer: BpmAnalyzer | null = null;
let analyser: AnalyserNode | null = null;

// Start listening to microphone
startBtn.addEventListener('click', async () => {
  try {
    showStatus('Starting microphone...', 'analyzing');

    // Create audio context
    const audioCtx = audioContext ?? new AudioContext();
    audioContext = audioCtx;

    // Resume audio context if suspended
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    // Request microphone access
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Handle the stream
    await handleStream(audioCtx, mediaStream);

    // Update UI
    startBtn.disabled = true;
    stopBtn.disabled = false;
    showStatus('Listening for music - play something!', 'success');
  } catch (error) {
    console.error('Error accessing microphone:', error);
    
    let errorMessage = 'Failed to access microphone';
    if (error instanceof Error) {
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Microphone access denied. Please allow microphone access.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No microphone found. Please connect a microphone.';
      } else {
        errorMessage = error.message;
      }
    }
    
    showStatus(errorMessage, 'error');
    cleanup();
  }
});

async function handleStream(audioCtx: AudioContext, stream: MediaStream) {
  // Resume audio context
  await audioCtx.resume();

  // Create BPM analyzer
  const analyzer = await createRealtimeBpmAnalyzer(audioCtx);
  bpmAnalyzer = analyzer;

  // Create analyser node for visualization (optional, but following the pattern)
  const analyserNode = audioCtx.createAnalyser();
  analyserNode.fftSize = 2048;
  analyser = analyserNode;

  // Create media stream source
  const mediaStreamSource = audioCtx.createMediaStreamSource(stream);
  source = mediaStreamSource;

  // Connect everything together
  // CRITICAL: BPM analyzer MUST be in the audio graph!
  mediaStreamSource.connect(analyserNode);
  mediaStreamSource.connect(analyzer.node);

  // Setup event listeners for BPM detection
  analyzer.on('bpmStable', onBpmStable);
}

function onBpmStable(data: BpmCandidates) {
  if (data.bpm.length > 0) {
    const primaryBpm = data.bpm[0].tempo;
    displayBpm(primaryBpm);
    showStatus(`Stable BPM detected: ${Math.round(primaryBpm)}`, 'success');
  }
}

// Stop listening
stopBtn.addEventListener('click', () => {
  disconnect();
  showStatus('Stopped listening', 'analyzing');
  hideBpm();
});

// Helper functions
function showStatus(message: string, type: 'analyzing' | 'success' | 'error') {
  statusElement.textContent = message;
  statusElement.className = `status visible ${type}`;
}

function displayBpm(bpm: number) {
  bpmValue.textContent = Math.round(bpm).toString();
  bpmDisplay.classList.add('visible');
}

function hideBpm() {
  bpmDisplay.classList.remove('visible');
  bpmValue.textContent = '--';
}

async function disconnect(): Promise<void> {
  if (!audioContext || !source || !bpmAnalyzer || !analyser) {
    return;
  }

  await audioContext.suspend();

  // Disconnect everything
  source.disconnect();
  analyser.disconnect();
  bpmAnalyzer.disconnect();

  // Reset UI
  startBtn.disabled = false;
  stopBtn.disabled = true;
}

function cleanup() {
  if (source) {
    source.disconnect();
    source = null;
  }

  if (analyser) {
    analyser.disconnect();
    analyser = null;
  }

  if (bpmAnalyzer) {
    bpmAnalyzer.disconnect();
    bpmAnalyzer = null;
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }

  startBtn.disabled = false;
  stopBtn.disabled = true;
}

// Cleanup on page unload
window.addEventListener('beforeunload', cleanup);
