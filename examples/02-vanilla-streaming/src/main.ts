import { createRealtimeBpmAnalyzer, type BpmAnalyzer } from 'realtime-bpm-analyzer';
import { createReadingPanel } from './reading-panel';
import { createStatePanel } from './state-panel';
import './panels.css';

// Get DOM elements
const audioUrlInput = document.getElementById('audioUrl') as HTMLInputElement;
const loadBtn = document.getElementById('loadBtn') as HTMLButtonElement;
const playBtn = document.getElementById('playBtn') as HTMLButtonElement;
const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement;
const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;
const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
const statusElement = document.getElementById('status') as HTMLDivElement;
const panels = document.getElementById('panels') as HTMLDivElement;

const statePanel = createStatePanel();
const readingPanel = createReadingPanel();
panels.append(statePanel.element, readingPanel.element);

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

  // One load at a time: a second click while this one awaits would attach a second analyzer
  loadBtn.disabled = true;

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
    watchAnalyzer(analyzer);

    // Create media source and connect the audio graph
    mediaSource = audioContext.createMediaElementSource(audioElement);

    // Connect: source → analyzer (its input holds what the engine needs) and source → destination
    mediaSource.connect(analyzer.input);
    mediaSource.connect(audioContext.destination);

    // Wait for audio to be ready
    await new Promise<void>((resolve, reject) => {
      audioElement!.addEventListener('canplay', () => resolve(), { once: true });
      audioElement!.addEventListener('error', () => reject(new Error('the audio could not be loaded')), { once: true });
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
  } finally {
    loadBtn.disabled = false;
  }
});

/**
 * Shows what the analyzer reports. Its state can be read at any time, and events are never replayed, so the
 * panel starts from `analyzer.state` and then follows the events.
 */
function watchAnalyzer(analyzer: BpmAnalyzer) {
  statePanel.clear();
  readingPanel.clear();
  statePanel.show(analyzer.state);

  // Fires on every change of status, of listening reason or of epoch, and only then
  analyzer.on('statechange', change => {
    statePanel.addChange(change);
    statePanel.show(change.to);
    // A reading belongs to settling and locked: back to listening, the last one may no longer hold
    if (change.to.status === 'listening' || change.to.status === 'stopped') {
      readingPanel.clear();
    }
    // stop() is final, whether the page or a fatal fault called it: there is nothing to start over
    if (change.to.status === 'stopped') {
      resetBtn.disabled = true;
    }
  });

  // While listening: how close the analyzer is to its first reading, from 0 to 1
  analyzer.on('progress', () => statePanel.show(analyzer.state));

  // Outside listening, every analysis step that measured something. The state is already current inside a
  // listener, so it says whether this reading is settling or locked. A lock can move without a statechange,
  // so the panel shows every reading, not only the one of the move to locked.
  analyzer.on('reading', reading => {
    const { status } = analyzer.state;
    if (status === 'settling' || status === 'locked') {
      readingPanel.show(reading, status);
    }
  });

  // A failed analysis step: the next step runs. A fatal fault is a statechange to stopped instead.
  analyzer.on('error', error => statePanel.showError(error));
}

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

// Start over: back to listening with the next epoch, and nothing measured before is reported
resetBtn.addEventListener('click', () => {
  if (bpmAnalyzer?.state.status !== 'stopped') {
    bpmAnalyzer?.reset();
  }
});

// Stop audio
stopBtn.addEventListener('click', () => {
  cleanup();
  hideStatus();
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

function hideStatus() {
  statusElement.className = 'status';
}

function enableControls(enabled: boolean) {
  playBtn.disabled = !enabled;
  pauseBtn.disabled = !enabled;
  // A fatal fault can stop the analyzer before the audio is ready: then there is nothing to start over
  resetBtn.disabled = !enabled || bpmAnalyzer?.state.status === 'stopped';
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
    // stop() is final: the state panel shows the move to stopped, and the next load creates a new analyzer
    bpmAnalyzer.stop();
    bpmAnalyzer.disconnect();
    bpmAnalyzer = null;
  }

  enableControls(false);
}

// Cleanup on page unload
window.addEventListener('beforeunload', cleanup);
