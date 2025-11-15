import { createRealtimeBpmAnalyzer, getBiquadFilter, type BpmAnalyzer, type BpmCandidates } from 'realtime-bpm-analyzer';

// Get DOM elements
const audioUrlInput = document.getElementById('audioUrl') as HTMLInputElement;
const loadBtn = document.getElementById('loadBtn') as HTMLButtonElement;
const playBtn = document.getElementById('playBtn') as HTMLButtonElement;
const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement;
const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
const statusElement = document.getElementById('status') as HTMLDivElement;
const bpmDisplay = document.getElementById('bpmDisplay') as HTMLDivElement;
const bpmValue = document.getElementById('bpmValue') as HTMLDivElement;

// Create audio context
const audioContext = new AudioContext();

// State
let audioElement: HTMLAudioElement | null = null;
let mediaSource: MediaElementAudioSourceNode | null = null;
let bpmAnalyzer: BpmAnalyzer | null = null;
let biquadFilter: BiquadFilterNode | null = null;

// Load audio from URL
loadBtn.addEventListener('click', async () => {
  const url = audioUrlInput.value.trim();
  if (!url) {
    showStatus('Please enter a valid URL', 'error');
    return;
  }

  try {
    // Clean up previous audio
    cleanup();

    showStatus('Loading audio...', 'analyzing');

    // Resume audio context if suspended
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    // Create audio element
    audioElement = new Audio(url);
    audioElement.crossOrigin = 'anonymous';

    // Create BPM analyzer
    bpmAnalyzer = await createRealtimeBpmAnalyzer(audioContext);

    // Create biquad filter for better audio processing
    biquadFilter = getBiquadFilter(audioContext);

    // Listen for BPM stable events
    bpmAnalyzer.on('bpmStable', (data: BpmCandidates) => {
      if (data.bpm.length > 0) {
        const primaryBpm = data.bpm[0].tempo;
        displayBpm(primaryBpm);
        showStatus(`Stable BPM detected: ${Math.round(primaryBpm)}`, 'playing');
      }
    });

    // Create media source and connect the audio graph
    mediaSource = audioContext.createMediaElementSource(audioElement);
    
    // Connect: source → filter → analyzer → destination
    mediaSource.connect(biquadFilter);
    biquadFilter.connect(bpmAnalyzer.node);
    mediaSource.connect(audioContext.destination);

    // Wait for audio to be ready
    await new Promise<void>((resolve, reject) => {
      audioElement!.addEventListener('canplay', () => resolve(), { once: true });
      audioElement!.addEventListener('error', (e) => reject(e), { once: true });
    });

    showStatus('Audio loaded - ready to play!', 'playing');
    enableControls(true);
  } catch (error) {
    console.error('Error loading audio:', error);
    showStatus(
      `Error: ${error instanceof Error ? error.message : 'Failed to load audio'}`,
      'error'
    );
    cleanup();
  }
});

// Play audio
playBtn.addEventListener('click', async () => {
  if (!audioElement) return;

  try {
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    await audioElement.play();
    showStatus('Playing and analyzing...', 'playing');
  } catch (error) {
    console.error('Error playing audio:', error);
    showStatus('Failed to play audio', 'error');
  }
});

// Pause audio
pauseBtn.addEventListener('click', () => {
  if (!audioElement) return;
  audioElement.pause();
  showStatus('Paused', 'analyzing');
});

// Stop audio
stopBtn.addEventListener('click', () => {
  cleanup();
  showStatus('Stopped', 'analyzing');
  hideBpm();
  enableControls(false);
});

// Example URL clicks
document.querySelectorAll('.example-link').forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    audioUrlInput.value = (e.target as HTMLAnchorElement).textContent || '';
  });
});

// Helper functions
function showStatus(message: string, type: 'analyzing' | 'playing' | 'error') {
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

function enableControls(enabled: boolean) {
  playBtn.disabled = !enabled;
  pauseBtn.disabled = !enabled;
  stopBtn.disabled = !enabled;
}

function cleanup() {
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
}

// Cleanup on page unload
window.addEventListener('beforeunload', cleanup);
