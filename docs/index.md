---
layout: home
title: Find the BPM of Any Song, Free
description: Find the BPM of any song free in your browser — drop a file, use your microphone, or paste a radio stream URL. Your audio never leaves your device. Also a zero-dependency TypeScript library for developers.

hero:
  name: "Realtime BPM Analyzer"
  text: "Find the BPM of Any Song"
  tagline: Free, private BPM detection — right in your browser. Also a zero-dependency TypeScript library for developers.
  image:
    src: /logo.svg
    alt: Realtime BPM Analyzer
  actions:
    - theme: alt
      text: Developer Docs
      link: /guide/getting-started

features:
  - icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>'
    title: Tap Tempo
    details: Tap along with any song to measure its tempo, with a steadiness score.
    link: /tap-tempo
    linkText: Tap the tempo

  - icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
    title: BPM to ms Calculator
    details: Delay and reverb times for every note value, straight, dotted and triplet.
    link: /bpm-to-ms
    linkText: Get delay times

  - icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/></svg>'
    title: Online Metronome
    details: Accented downbeats, 1 to 12 beats per bar, subdivisions and tap to set.
    link: /metronome
    linkText: Start the metronome
---

## What is BPM?

**BPM** stands for _beats per minute_ — the tempo of a piece of music. It is the
count of the underlying beats in one minute. A typical house track runs at 120–130
BPM, drum and bass at 160–180, ambient and downtempo below 100. DJs match BPMs to
mix songs smoothly. Fitness instructors pick tracks by BPM to match exercise intensity.
Producers check BPM to build remixes. Dancers count BPM to choose routines.

Drop a file, use your microphone, or paste a radio stream URL above — everything
is analysed right in your browser. **Your audio never leaves your device**, and no account is required.

## Who is it for?

<div class="tip custom-block" style="padding-top: 8px">

- **DJs and producers** — find the BPM of a track before dropping it into a mix
- **Dancers and choreographers** — pick routines to match a song's tempo
- **Fitness instructors** — curate playlists that match workout intensity
- **Music educators** — teach rhythm with concrete numbers
- **Content creators** — sync video cuts or transitions to a song's beat
- **Developers** — embed the same detection in your own app via the library below

</div>

## Frequently asked questions

### How does it work?

The analyzer uses the **Web Audio API** to decode audio directly in your browser,
applies a low-pass filter to isolate the low-frequency transients that usually
carry the beat, and counts the intervals between detected peaks. The most frequent
interval gives the BPM. Everything happens on your device.

### Is my audio sent to a server?

**No.** Files you drop, microphone input and stream audio are all analysed in
your browser by the open-source library, which sends nothing anywhere. Your audio
never leaves your device.

### Which audio formats are supported?

**MP3, WAV, FLAC, M4A and OGG**, and in general any audio your browser can play,
including the sound of a video file. Microphone input and live streams have no
format constraint.

### Does it work on mobile?

Yes. The tool works on modern mobile browsers (iOS Safari and Android Chrome).
Choosing a file, microphone permission and stream playback all work on touch
devices.

### How accurate is the BPM detection?

For most modern music with a steady beat, detection is accurate within **1–2 BPM**.
Ambient, rubato, or beatless tracks are harder and may not produce a confident
result. The analyzer always returns the top candidates so you can compare.

### Can I use this as a library in my own app?

**Yes.** The analyzer is a zero-dependency TypeScript library published to npm.
See the **developer docs** below.

## For developers

`realtime-bpm-analyzer` is the same engine that powers this page, published as
a standalone library. **Zero runtime dependencies.** Full TypeScript types.
Works with vanilla JS, React, Vue, or any modern framework.

- **Real time or offline.** Follow a playing track, a microphone or a stream
  as it plays, or analyse a whole file at once.
- **Peak and interval analysis.** Low-pass filtered peaks, grouped by the
  intervals between them, give the tempo candidates.
- **Configurable.** Tune the thresholds, the stabilisation time and the
  analysis parameters to your use case.

### Install

```bash
npm install realtime-bpm-analyzer
```

### Analyse audio in real time

```typescript
import { createRealtimeBpmAnalyzer, getBiquadFilter } from 'realtime-bpm-analyzer';

// Create audio context
const audioContext = new AudioContext();

// Create the BPM analyzer processor
const bpmAnalyzer = await createRealtimeBpmAnalyzer(audioContext);

// Set up audio source
const track = document.getElementById('audio') as HTMLAudioElement;
const source = audioContext.createMediaElementSource(track);
const lowpass = getBiquadFilter(audioContext);

// Connect nodes
source.connect(lowpass).connect(bpmAnalyzer.node);
source.connect(audioContext.destination);

// Listen for BPM events
bpmAnalyzer.on('bpm', (data) => console.log('Current BPM:', data.bpm));
bpmAnalyzer.on('bpmStable', (data) => console.log('Stable BPM detected:', data.bpm));

// Cleanup when done
bpmAnalyzer.disconnect();
```

### Tutorials

- [Realtime BPM Detection in the Browser](/guide/realtime-bpm-detection) —
  AudioWorklet-native, file + mic + stream, the modern way.
- [How to Detect BPM from a Microphone in JavaScript](/guide/bpm-from-microphone)
  — `getUserMedia`, permissions, mobile gotchas, and a working pattern.
- [useBpm — A React Hook for Realtime BPM Detection](/guide/react-bpm-hook) —
  drop-in hook with full TypeScript types and StrictMode-safe cleanup.

See the [full developer guide](/guide/getting-started), the
[API reference](/api/), and the [examples](/examples/basic-usage) for file
analysis, microphone input, streaming audio, and framework integrations.
