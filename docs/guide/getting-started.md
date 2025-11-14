# Getting Started

This guide will help you install and start using Realtime BPM Analyzer in your project.

## Installation

### Using npm

```bash
npm install realtime-bpm-analyzer
```

### Using yarn

```bash
yarn add realtime-bpm-analyzer
```

### Using pnpm

```bash
pnpm add realtime-bpm-analyzer
```

### Via CDN

You can also use the library directly from a CDN:

```html
<script type="module">
  import { createRealTimeBpmProcessor } from 'https://cdn.jsdelivr.net/npm/realtime-bpm-analyzer/+esm';
</script>
```

## Quick Start

Here's a complete example to get you started with real-time BPM analysis:

### 1. HTML Setup

Create an audio element:

```html
<!DOCTYPE html>
<html>
<head>
  <title>BPM Analyzer Demo</title>
</head>
<body>
  <audio id="track" src="your-audio-file.mp3" controls></audio>
  <div id="bpm">BPM: --</div>
  
  <script type="module" src="./app.js"></script>
</body>
</html>
```

### 2. JavaScript Implementation

```javascript
import { createRealTimeBpmProcessor, getBiquadFilter } from 'realtime-bpm-analyzer';

async function setupBPMAnalyzer() {
  // Create audio context
  const audioContext = new AudioContext();
  
  // Create the BPM analyzer processor
  const realtimeAnalyzerNode = await createRealTimeBpmProcessor(audioContext);
  
  // Get audio element
  const audioElement = document.getElementById('track');
  
  // Create media source from audio element
  const source = audioContext.createMediaElementSource(audioElement);
  
  // Create and configure low-pass filter (helps isolate bass frequencies)
  const lowpass = getBiquadFilter(audioContext);
  
  // Connect the audio graph:
  // source → filter → analyzer → (back to) source → destination (speakers)
  source.connect(lowpass);
  lowpass.connect(realtimeAnalyzerNode);
  source.connect(audioContext.destination);
  
  // Listen for BPM events with typed event listeners
  realtimeAnalyzerNode.on('bpm', (data) => {
    // Continuous BPM updates
    console.log('Current BPM candidates:', data.bpm);
    updateDisplay(data.bpm);
  });
  
  realtimeAnalyzerNode.on('bpmStable', (data) => {
    // Stable BPM detected (more confident result)
    console.log('Stable BPM:', data.bpm);
    updateDisplay(data.bpm, true);
  });
  
  // Start playback when user clicks play
  audioElement.play();
}

function updateDisplay(bpmCandidates, isStable = false) {
  const bpmDisplay = document.getElementById('bpm');
  
  if (bpmCandidates && bpmCandidates.length > 0) {
    const topBPM = bpmCandidates[0].tempo;
    bpmDisplay.textContent = `BPM: ${topBPM}${isStable ? ' ✓' : ''}`;
    bpmDisplay.style.color = isStable ? 'green' : 'orange';
  }
}

// Initialize when page loads
setupBPMAnalyzer();
```

## TypeScript Example

For TypeScript projects, you get full type safety:

```typescript
import { 
  createRealTimeBpmProcessor, 
  getBiquadFilter,
  type BpmCandidates
} from 'realtime-bpm-analyzer';

async function setupBPMAnalyzer(): Promise<void> {
  const audioContext = new AudioContext();
  const realtimeAnalyzerNode = await createRealTimeBpmProcessor(audioContext);
  
  const audioElement = document.getElementById('track') as HTMLAudioElement;
  const source = audioContext.createMediaElementSource(audioElement);
  const lowpass = getBiquadFilter(audioContext);
  
  source.connect(lowpass).connect(realtimeAnalyzerNode);
  source.connect(audioContext.destination);
  
  realtimeAnalyzerNode.on('bpm', (data: BpmCandidates) => {
    handleBPMUpdate(data, false);
  });
  
  realtimeAnalyzerNode.on('bpmStable', (data: BpmCandidates) => {
    handleBPMUpdate(data, true);
  });
}

function handleBPMUpdate(data: BpmCandidates, isStable: boolean): void {
  if (data.bpm.length > 0) {
    const topCandidate = data.bpm[0];
    console.log(`Detected BPM: ${topCandidate.tempo} (count: ${topCandidate.count})`);
  }
}
```

## Understanding the Events

The analyzer emits two main types of BPM events:

### `bpm` Event
- Emitted frequently during analysis
- Contains multiple BPM candidates with confidence scores
- Values may fluctuate as more data is analyzed
- Use for real-time display or progressive analysis

### `bpmStable` Event
- Emitted when a stable, confident BPM is detected
- Indicates the analyzer has gathered enough data
- More reliable for final BPM determination
- Threshold increases over time for better accuracy

## Next Steps

Now that you have the basics, check out practical examples:

- [Basic Usage](/examples/basic-usage) - Complete vanilla JS examples
- [React Integration](/examples/react) - React hooks and patterns
- [Next.js Integration](/examples/nextjs) - App Router and Server Components
- [Microphone Input](/examples/microphone-input) - Real-time audio from mic
- [File Upload](/examples/file-upload) - Analyze uploaded audio files

::: tip Pro Tip
Always create the `AudioContext` in response to a user action (like a button click) to avoid browser autoplay restrictions.
:::
