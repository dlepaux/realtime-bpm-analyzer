---
title: What is Realtime BPM Analyzer?
description: A zero-dependency TypeScript library for detecting tempo (BPM) in the browser from files, microphone, and live streams. AudioWorklet-native, framework-agnostic.
---

# What is Realtime BPM Analyzer?

Realtime BPM Analyzer is a dependency-free TypeScript/JavaScript library that enables you to detect the **beats-per-minute (BPM)** or **tempo** of audio and video sources directly in the browser.

## Key Features

### 🎵 Real-Time Analysis
Analyze BPM while audio or video is playing. Get instant feedback with both continuous updates and stable BPM detection events.

### ⚡ Zero Dependencies
Built entirely on the [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) with no external dependencies, so it runs in modern browsers with nothing else to install.

### 🎯 Two Engines
- **`tempogram`** (default) - Reads the tempo from an onset tempogram: spectral flux across several bands, and a sliding autocorrelation
- **`peaks`** - Scans the low-passed signal for amplitude peaks, and groups the intervals between them into tempo candidates

Both report the same reading, so switching is one option: `engine: 'peaks'`.

### 🎬 Multiple Input Sources
Works with various audio sources:
- HTML `<audio>` and `<video>` elements
- Local files (MP3, FLAC, WAV)
- Microphone/getUserMedia streams
- Network audio streams
- Any source compatible with Web Audio API

### 📦 TypeScript Support
Written in TypeScript with complete type definitions, so your editor autocompletes and type-checks every call.

## How It Works

The library analyzes audio data in real-time using the Web Audio API's `AudioWorkletProcessor`. Here's a simplified flow, with the `peaks` engine:

1. **Audio Input** → Audio is captured from your source
2. **Filtering** → A low-pass filter isolates bass frequencies (the `tempogram` engine keeps the full band)
3. **Peak Detection** → Identifies peaks in the audio signal at various threshold levels
4. **Interval Analysis** → Calculates time intervals between peaks
5. **BPM Calculation** → Converts intervals to BPM and groups similar tempos
6. **Result Output** → Emits a reading: the tempo, and up to five candidates with their relation to it

The default `tempogram` engine replaces steps 2 to 5: it measures how the spectrum changes from frame to frame across several bands, and finds the tempo that repeats in it. Both engines end at the same reading.

## Use Cases

Used for:

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
