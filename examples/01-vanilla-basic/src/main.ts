import { analyzeFullBuffer } from 'realtime-bpm-analyzer';
import { createReadingPanel } from './reading-panel';
import './panels.css';

// Get DOM elements
const audioFileInput = document.getElementById('audioFile') as HTMLInputElement;
const statusElement = document.getElementById('status') as HTMLDivElement;
const panels = document.getElementById('panels') as HTMLDivElement;

const readingPanel = createReadingPanel();
panels.append(readingPanel.element);

// Create audio context
const audioContext = new AudioContext();

// Handle file selection
audioFileInput.addEventListener('change', async (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  readingPanel.clear();
  audioFileInput.disabled = true;

  try {
    // Decode the file, or a video's sound track. A format the browser can't decode rejects here, with an EncodingError.
    showStatus('Decoding...', 'analyzing');
    const audioBuffer = await audioContext.decodeAudioData(await file.arrayBuffer());

    // Analyze the whole buffer at once: the same reading a live analyzer reports, or null when no tempo was found
    showStatus('Analyzing...', 'analyzing');
    const reading = await analyzeFullBuffer(audioBuffer);

    if (reading === null) {
      showStatus('No clear tempo found in this file', 'error');
      return;
    }

    readingPanel.show(reading);
    showStatus('Analysis complete!', 'success');
  } catch (error) {
    console.error('Error analyzing audio:', error);
    showStatus(describeError(error), 'error');
  } finally {
    audioFileInput.disabled = false;
  }
});

// Helper functions
function showStatus(message: string, type: 'analyzing' | 'success' | 'error') {
  statusElement.textContent = message;
  statusElement.className = `status visible ${type}`;
}

function describeError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'EncodingError') {
    return 'This file could not be decoded. Try an MP3, WAV, OGG or FLAC file, or an MP4 or WebM video.';
  }

  return error instanceof Error ? error.message : 'Failed to analyze audio';
}
