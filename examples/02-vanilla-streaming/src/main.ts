import { createRealtimeBpmAnalyzer, type BpmAnalyzer } from 'realtime-bpm-analyzer';

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
    const analyzer = await createRealtimeBpmAnalyzer(audioContext);
    bpmAnalyzer = analyzer;

    // The state is current inside a reading listener. A lock can move without a statechange (peaks relocks
    // on a fuller rung), so the locked BPM is read from every reading, not only from the move to locked.
    analyzer.on('reading', reading => {
      if (analyzer.state.status === 'locked') {
        displayBpm(reading.bpm);
        showStatus(`Stable BPM detected: ${Math.round(reading.bpm)}`, 'playing');
      }
    });

    // Create media source and connect the audio graph
    mediaSource = audioContext.createMediaElementSource(audioElement);
    
    // Connect: source → analyzer (its input holds the lowpass) and source → destination
    mediaSource.connect(bpmAnalyzer.input);
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

  if (bpmAnalyzer) {
    // stop() is final: it ends the analysis, and the next start creates a new analyzer.
    bpmAnalyzer.stop();
    bpmAnalyzer.disconnect();
    bpmAnalyzer = null;
  }
}

// Cleanup on page unload
window.addEventListener('beforeunload', cleanup);
