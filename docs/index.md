---
layout: home
title: "BPM Finder: Find the BPM of Any Song"
description: Find the BPM of any song in your browser. This free BPM detector reads a file, the microphone or a stream, and your audio never leaves your device.

hero:
  name: "Realtime BPM Analyzer"
  text: "BPM Finder: Find the BPM of Any Song"
  tagline: A free BPM detector that runs in your browser. Drop a song, use the microphone or play a stream, and your audio stays on your device. Also a zero-dependency TypeScript library for developers.
  image:
    src: /logo.svg
    alt: Realtime BPM Analyzer
  actions:
    - theme: alt
      text: Developer Docs
      link: /guide/getting-started

features:
  - icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>'
    title: Video BPM Finder
    details: Find the BPM of the music in a video file, with one beat in frames for cutting.
    link: /video-bpm
    linkText: Find a video's BPM

  - icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/></svg>'
    title: BPM to Frames Calculator
    details: Frames per beat and per bar at 23.976 to 60 fps, and the drift of a rounded cut.
    link: /bpm-to-frames
    linkText: Get frames per beat

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

## Find the BPM of a song

Choose how the music reaches the tool above. It listens, finds the beats and
counts them, then shows the tempo in beats per minute (BPM). Everything runs in
your browser, with no account and no upload.

- **A song file.** Drop an MP3, WAV, FLAC, M4A or OGG file, or click to browse.
  The tool reads the whole song and gives its BPM.
- **The microphone.** Play music near your phone or computer and it works as a
  live BPM counter: the number updates as it listens, then holds once the beat
  is steady.
- **A stream or another tab.** Paste the address of an online radio stream to
  read its tempo as it plays. A YouTube or Spotify link can't play here, so on
  desktop Chrome and Edge the tool offers to share the audio of the tab that
  plays it, and elsewhere the microphone.
- **A video.** To find the BPM of a video and get the beat in frames, use the
  [video BPM finder](/video-bpm).

Not sure of a reading? [Tap along](/tap-tempo) to check it.

## Limits

- **One tempo per file.** A song that changes tempo, or a file with several
  songs, gets one reading.
- **The beat must be steady and audible.** Ambient, rubato or beatless music may
  not give a confident result. Through the microphone, room noise and quiet
  playback make it harder.
- **A reading can be half or double** the tempo you hear. Both describe the same
  music.
- **Streams must allow it.** A station has to let other sites play its audio.
  Sharing a tab's audio works on desktop Chrome and Edge only.
- **The file is read into memory.** A very long recording can be more than a
  browser tab can hold.

## What is BPM?

**BPM** stands for _beats per minute_, the tempo of a piece of music. It is the
count of the underlying beats in one minute. A typical house track runs at 120 to 130
BPM, drum and bass at 160 to 180, ambient and downtempo below 100. DJs match BPMs to
mix songs smoothly. Fitness instructors pick tracks by BPM to match exercise intensity.
Producers check BPM to build remixes. Dancers count BPM to choose routines.

## Who is it for?

<div class="tip custom-block" style="padding-top: 8px">

- **DJs and producers:** find the BPM of a track before dropping it into a mix.
- **Dancers and choreographers:** pick routines to match a song's tempo.
- **Fitness instructors:** build playlists that match workout intensity.
- **Music educators:** teach rhythm with concrete numbers.
- **Content creators:** cut video to a song's beat. Find the [BPM of a video](/video-bpm), then the [beat in frames](/bpm-to-frames).
- **Developers:** embed the same detection in your own app with the library below.

</div>

## Frequently asked questions

### How does it work?

The analyzer uses the **Web Audio API** to decode audio directly in your browser,
applies a low-pass filter to isolate the low-frequency transients that usually
carry the beat, and counts the intervals between detected peaks. The most frequent
interval gives the BPM. The analysis happens on your device.

### Is my audio sent to a server?

**No.** Files you drop, microphone input and stream audio are all analysed in
your browser by the open-source library, which sends nothing anywhere. Your audio
never leaves your device. The website uses Google Analytics to record how the
tool is used, such as the tempo found and, for a file, its size, type and duration. It
never records the file, its sound or its name. [Website Privacy](/website-privacy)
has the details.

### Which audio formats are supported?

**MP3, WAV, FLAC, M4A and OGG**, and in general any audio your browser can play,
including the sound of a video file. Microphone input and live streams have no
format constraint.

### Does it work on mobile?

Yes. The tool works on modern mobile browsers (iOS Safari and Android Chrome).
Choosing a file, microphone permission and stream playback all work on touch
devices.

### How accurate is the BPM detection?

It works best on music with a steady beat. Ambient, rubato or beatless tracks are
harder and may not produce a confident result. A very fast or very slow track can
read at half or double its tempo, so check the number against what you hear.

### Can I use this as a library in my own app?

**Yes.** The analyzer is a zero-dependency TypeScript library published to npm.
See the **developer docs** below.

## For developers

`realtime-bpm-analyzer` is the same engine that powers this page, published as
a standalone library. **Zero runtime dependencies.** Full TypeScript types.
Works with vanilla JS, React, Vue, or any modern framework.

- **Real time or whole file.** Follow a playing track, a microphone or a stream
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
import { createRealtimeBpmAnalyzer } from 'realtime-bpm-analyzer';

// Create audio context
const audioContext = new AudioContext();

// Create the BPM analyzer processor
const bpmAnalyzer = await createRealtimeBpmAnalyzer(audioContext);

// Set up audio source
const track = document.getElementById('audio') as HTMLAudioElement;
const source = audioContext.createMediaElementSource(track);

// Connect nodes: the analyzer's input holds the low-pass filter it needs
source.connect(bpmAnalyzer.input);
source.connect(audioContext.destination);

// Listen for BPM events
bpmAnalyzer.on('bpm', (data) => console.log('Current BPM:', data.bpm));
bpmAnalyzer.on('bpmStable', (data) => console.log('Stable BPM detected:', data.bpm));

// Call this when you're done listening: stop() ends the analysis,
// disconnect() alone would leave it running
function stop() {
  bpmAnalyzer.stop();
  source.disconnect();
}
```

### Tutorials

- [Realtime BPM Detection in the Browser](/guide/realtime-bpm-detection):
  AudioWorklet-native, for a file, the microphone or a stream.
- [How to Detect BPM from a Microphone in JavaScript](/guide/bpm-from-microphone):
  `getUserMedia`, permissions, mobile gotchas, and a working pattern.
- [useBpm, a React Hook for Realtime BPM Detection](/guide/react-bpm-hook):
  a drop-in hook with full TypeScript types and StrictMode-safe cleanup.

See the [full developer guide](/guide/getting-started), the
[API reference](/api/), and the [examples](/examples/basic-usage) for file
analysis, microphone input, streaming audio, and framework integrations.
