import { createRealtimeBpmAnalyzer, type BpmAnalyzer } from 'realtime-bpm-analyzer';
import { createReadingPanel } from './reading-panel';
import { createStatePanel } from './state-panel';
import './panels.css';

// Get DOM elements
const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;
const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
const statusElement = document.getElementById('status') as HTMLDivElement;
const panels = document.getElementById('panels') as HTMLDivElement;

const statePanel = createStatePanel();
const readingPanel = createReadingPanel();
panels.append(statePanel.element, readingPanel.element);

// State
let audioContext: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
let source: MediaStreamAudioSourceNode | null = null;
let bpmAnalyzer: BpmAnalyzer | null = null;

// Start listening to microphone
startBtn.addEventListener('click', async () => {
  // One start at a time: a second click while the permission prompt is open would open a second analyzer
  startBtn.disabled = true;

  try {
    showStatus('Starting microphone...', 'analyzing');

    // Create audio context
    const audioCtx = audioContext ?? new AudioContext();
    audioContext = audioCtx;

    // Request microphone access
    // Disable the voice-mode filters. Echo cancellation removes audio coming
    // from the device's own speakers, which silences music played on the same
    // device; noise suppression and auto gain control distort the beat.
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    // Handle the stream
    await handleStream(audioCtx, mediaStream);

    // Update UI
    startBtn.disabled = true;
    resetBtn.disabled = false;
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
    await stopListening();
  }
});

async function handleStream(audioCtx: AudioContext, stream: MediaStream) {
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
}

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

// Start over: back to listening with the next epoch, and nothing measured before is reported
resetBtn.addEventListener('click', () => {
  if (bpmAnalyzer?.state.status !== 'stopped') {
    bpmAnalyzer?.reset();
  }
});

// Stop listening
stopBtn.addEventListener('click', async () => {
  await stopListening();
  hideStatus();
});

// Helper functions
function showStatus(message: string, type: 'analyzing' | 'success' | 'error') {
  statusElement.textContent = message;
  statusElement.className = `status visible ${type}`;
}

function hideStatus() {
  statusElement.className = 'status';
}

async function stopListening(): Promise<void> {
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

  // Stop microphone tracks so the browser releases the device.
  // Without this, the mic LED stays on and the track keeps capturing
  // until the tab is closed.
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }

  await audioContext?.suspend();

  startBtn.disabled = false;
  resetBtn.disabled = true;
  stopBtn.disabled = true;
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  void stopListening();
});
