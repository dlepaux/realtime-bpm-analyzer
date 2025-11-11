---
layout: home

hero:
  name: "Realtime BPM Analyzer"
  text: "Detect Tempo in Real-Time"
  tagline: A powerful, dependency-free TypeScript library for analyzing beats-per-minute (BPM) of audio and video sources directly in your browser
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/dlepaux/realtime-bpm-analyzer
    - theme: alt
      text: Examples
      link: /examples/basic-usage

features:
  - icon: 🎵
    title: Real-Time Analysis
    details: Analyze BPM while audio or video is playing, with instant feedback and continuous monitoring capabilities.
  
  - icon: ⚡
    title: Zero Dependencies
    details: Built entirely on the Web Audio API with no external dependencies. Lightweight and efficient.
  
  - icon: 🎯
    title: Accurate Detection
    details: Advanced algorithm based on peak detection and interval analysis provides reliable BPM results.
  
  - icon: 🎬
    title: Multiple Sources
    details: Works with audio/video elements, file uploads, microphone input, and streaming sources.
  
  - icon: 📦
    title: TypeScript Support
    details: Written in TypeScript with full type definitions for excellent IDE integration and type safety.
  
  - icon: 🎛️
    title: Flexible Strategies
    details: Choose between player, continuous analysis, or offline strategies based on your use case.
  
  - icon: 🌐
    title: Browser Compatible
    details: Supports all modern browsers with Web Audio API. Works with MP3, FLAC, and WAV formats.
  
  - icon: 🔧
    title: Easy Integration
    details: Simple API that works with vanilla JS, React, Vue, Next.js, and any modern framework.
  
  - icon: 🎨
    title: Customizable
    details: Configure threshold levels, stabilization time, and analysis parameters to fit your needs.
---

## Quick Start

Install via npm:

```bash
npm install realtime-bpm-analyzer
```

Analyze BPM in real-time:

```typescript
import { createRealTimeBpmProcessor, getBiquadFilter } from 'realtime-bpm-analyzer';

// Create audio context
const audioContext = new AudioContext();

// Create the BPM analyzer processor
const realtimeAnalyzerNode = await createRealTimeBpmProcessor(audioContext);

// Set up audio source
const track = document.getElementById('audio') as HTMLAudioElement;
const source = audioContext.createMediaElementSource(track);
const lowpass = getBiquadFilter(audioContext);

// Connect nodes
source.connect(lowpass).connect(realtimeAnalyzerNode);
source.connect(audioContext.destination);

// Listen for BPM events with typed listeners
realtimeAnalyzerNode.on('bpm', (data) => {
  console.log('Current BPM:', data.bpm);
});

realtimeAnalyzerNode.on('bpmStable', (data) => {
  console.log('Stable BPM detected:', data.bpm);
});
```

## Why Realtime BPM Analyzer?

<div class="tip custom-block" style="padding-top: 8px">

🎵 **Perfect for:**
- DJ applications and music players
- Audio visualization tools
- Music analysis platforms
- Fitness and dance applications
- Interactive audio experiences

</div>
