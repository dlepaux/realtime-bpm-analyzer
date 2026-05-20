---
title: What is Realtime BPM Analyzer?
description: A zero-dependency TypeScript library for detecting tempo (BPM) in the browser from files, microphone, and live streams. AudioWorklet-native, < 5 KB gzipped, framework-agnostic.
---

# What is Realtime BPM Analyzer?

Realtime BPM Analyzer is a powerful, dependency-free TypeScript/JavaScript library that enables you to detect the **beats-per-minute (BPM)** or **tempo** of audio and video sources directly in the browser.

## Key Features

### 🎵 Real-Time Analysis
Analyze BPM while audio or video is playing. Get instant feedback with both continuous updates and stable BPM detection events.

### ⚡ Zero Dependencies
Built entirely on the [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) with no external dependencies. This keeps the library lightweight (< 5KB gzipped) and ensures compatibility across modern browsers.

### 🎯 Accurate Detection
Uses an advanced algorithm based on:
- **Amplitude threshold scanning** - Detects peaks in the audio signal
- **Interval analysis** - Identifies patterns in peak timing
- **Tempo grouping** - Groups similar tempos and selects the best candidates

### 🎬 Multiple Input Sources
Works with various audio sources:
- HTML `<audio>` and `<video>` elements
- File uploads (MP3, FLAC, WAV)
- Microphone/getUserMedia streams
- Network audio streams
- Any source compatible with Web Audio API

### 📦 TypeScript Support
Written in TypeScript with complete type definitions for excellent IDE integration and type safety.

## How It Works

The library analyzes audio data in real-time using the Web Audio API's `AudioWorkletProcessor`. Here's a simplified flow:

1. **Audio Input** → Audio is captured from your source
2. **Filtering** → Optional low-pass filter to isolate bass frequencies
3. **Peak Detection** → Identifies peaks in the audio signal at various threshold levels
4. **Interval Analysis** → Calculates time intervals between peaks
5. **BPM Calculation** → Converts intervals to BPM and groups similar tempos
6. **Result Output** → Emits BPM candidates with confidence scores

## Use Cases

Perfect for:

- 🎧 **DJ Applications** - Auto-sync tracks, beatmatching
- 🎵 **Music Players** - Display current track tempo
- 📊 **Audio Visualization** - Sync visuals to detected BPM
- 💪 **Fitness Apps** - Match workout intensity to music tempo
- 🎹 **Music Production Tools** - Analyze and catalog track tempos
- 🎪 **Interactive Experiences** - Create tempo-reactive installations

## Browser Support

Works in all modern browsers that support:
- ✅ Web Audio API
- ✅ AudioWorklet

::: tip
For older browser support, consider using a polyfill or fallback strategy.
:::

## Next Steps

<div class="tip custom-block" style="padding-top: 8px">

Ready to get started?

- 📚 [Getting Started](/guide/getting-started) - Install and use the library
- 🎯 [Core Concepts](/guide/core-concepts) - Understand key concepts
- 💡 [Examples](/examples/basic-usage) - See practical examples

</div>
