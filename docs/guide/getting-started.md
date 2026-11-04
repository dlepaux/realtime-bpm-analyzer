---
title: 'Getting Started: Install realtime-bpm-analyzer'
description: Install realtime-bpm-analyzer via npm, yarn, or pnpm and detect BPM from audio files, microphone, and streams in the browser. Zero dependencies, full TypeScript types.
---

<script setup>
import GithubStarSupport from '../.vitepress/components/GithubStarSupport.vue'
</script>

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
  import { createRealtimeBpmAnalyzer } from 'https://cdn.jsdelivr.net/npm/realtime-bpm-analyzer@6/+esm';
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
import { createRealtimeBpmAnalyzer } from 'realtime-bpm-analyzer';

async function setupBPMAnalyzer() {
  // Create audio context
  const audioContext = new AudioContext();

  // Create the BPM analyzer (an event target around an AudioWorkletNode)
  const analyzer = await createRealtimeBpmAnalyzer(audioContext);

  // Get audio element
  const audioElement = document.querySelector('audio');

  // Create media source from audio element
  const source = audioContext.createMediaElementSource(audioElement);

  // Connect the source to the analyzer's input, which holds the low-pass
  // filter the default engine expects (it isolates bass frequencies)
  source.connect(analyzer.input);
  source.connect(audioContext.destination);

  // Every analysis step after the first reading: show the tempo
  analyzer.on('reading', (reading) => {
    updateDisplay(reading.bpm, analyzer.state.status === 'locked');
  });

  // The analyzer locked: the readings agree
  analyzer.on('statechange', ({ to }) => {
    if (to.status === 'locked') {
      console.log('Locked BPM:', to.reading.bpm);
      updateDisplay(to.reading.bpm, true);
    }
  });

  // Start playback when user clicks play
  audioElement.play();
}

function updateDisplay(bpm, isLocked = false) {
  const bpmDisplay = document.getElementById('bpm');
  bpmDisplay.textContent = `BPM: ${bpm}${isLocked ? ' ✓' : ''}`;
  bpmDisplay.style.color = isLocked ? 'green' : 'orange';
}

// Initialize when page loads
setupBPMAnalyzer();
```

## TypeScript Example

For TypeScript projects, you get full type safety:

```typescript
import {
  createRealtimeBpmAnalyzer,
  type Reading,
} from 'realtime-bpm-analyzer';

async function setupBPMAnalyzer(): Promise<void> {
  const audioContext = new AudioContext();
  const analyzer = await createRealtimeBpmAnalyzer(audioContext);

  const audioElement = document.getElementById('track') as HTMLAudioElement;
  const source = audioContext.createMediaElementSource(audioElement);

  source.connect(analyzer.input);
  source.connect(audioContext.destination);

  analyzer.on('reading', (reading: Reading) => {
    handleBPMUpdate(reading, analyzer.state.status === 'locked');
  });

  analyzer.on('statechange', ({ to }) => {
    if (to.status === 'locked') {
      handleBPMUpdate(to.reading, true);
    }
  });
}

function handleBPMUpdate(reading: Reading, isLocked: boolean): void {
  const others = reading.candidates.slice(1).map(({ bpm, relation }) => `${bpm} (${relation})`);
  console.log(`Detected BPM: ${reading.bpm}${isLocked ? ', locked' : ''}. Others: ${others.join(', ')}`);
}
```

## Understanding the Events

The analyzer has a state you can read at any time, `analyzer.state`. Its `status` moves from `listening` to `settling` at the first reading, then to `locked` once the readings agree. Two events matter most:

### `reading` Event {#bpm-event}
- Emitted on every analysis step once the first reading is in
- Carries one tempo, `bpm`, and up to 5 `candidates`, the top one first, each with its `relation` to that tempo
- Values may fluctuate as more data is analyzed
- Use for real-time display or progressive analysis

### `statechange` Event {#bpmstable-event}
- Emitted on every change of status, with `from`, `to` and a `reason`
- `to.status === 'locked'` means the readings agree: with the default engine, no sooner than 10 seconds of audio
- More reliable for final BPM determination
- The tempo can still move a little while locked, so keep showing the latest reading

When you are done, call `analyzer.stop()`. It is final: create a new analyzer to listen again.

## Next Steps

Now that you have the basics, check out practical examples:

- [Basic Usage](/examples/basic-usage) - Whole-file analysis of a local file
- [Streaming Audio](/examples/streaming-audio) - Real-time stream analysis
- [Microphone Input](/examples/microphone-input) - Real-time audio from microphone
- [React Integration](/examples/react) - React hooks and patterns
- [Vue Integration](/examples/vue) - Vue 3 Composition API patterns

::: tip Pro Tip
Always create the `AudioContext` in response to a user action (like a button click) to avoid browser autoplay restrictions.
:::

<div style="margin-top: 3rem; max-width: 480px; margin-left: auto; margin-right: auto;">
  <GithubStarSupport variant="block" placement="getting-started-end" />
</div>
