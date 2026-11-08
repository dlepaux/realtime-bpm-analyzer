---
layout: home
title: "BPM Finder: Find the BPM of Any Song"
description: Find the BPM of any song in your browser. This free BPM detector reads a file, the microphone or a stream, and your audio never leaves your device.

homeHero:
  # HomeHero.vue draws this: the brand as a small line above, then the h1 (RBA-66).
  text: "BPM Finder: Find the BPM of Any Song"
  tagline: A free BPM detector that runs in your browser. Drop a song, use the microphone or play a stream, and your audio stays on your device. Also a zero-dependency TypeScript library for developers.
---

<script setup>
import HomeByline from './.vitepress/components/HomeByline.vue'
</script>

<HomeByline />

## Find the BPM of a song

Choose how the music reaches the tool above. It listens, finds the beats and
counts them, then shows the tempo in beats per minute (BPM). Everything runs in
your browser, with no account and no upload.

<div class="home-ways">

- **A song file.** Drop an MP3, WAV, FLAC, M4A or OGG file, or click to browse.
  The tool reads the whole song and gives its BPM.
- **The microphone.** Play music near your phone or computer and it works as a
  live BPM counter: the number updates as it listens, then holds once the beat
  is steady.
- **A stream or another tab.** Paste the address of an online radio stream to
  read its tempo as it plays. A YouTube or Spotify link can't play here, so on
  desktop Chrome and Edge the tool offers to share the audio of the tab that
  plays it, and elsewhere the microphone.

</div>

**A video.** To find the BPM of the sound track of a video file and get the
beat in frames, use the [video BPM finder](/video-bpm).

Not sure of a reading? [Tap along](/tap-tempo) to check it.

<div class="home-pair">
<div>

## What is BPM?

**BPM** stands for _beats per minute_, the tempo of a piece of music. It is the
count of the underlying beats in one minute. A typical house track runs at 120 to 130
BPM, drum and bass at 160 to 180, ambient and downtempo below 100. DJs match BPMs to
mix songs smoothly. Fitness instructors pick tracks by BPM to match exercise intensity.
Producers check BPM to build remixes. Dancers count BPM to choose routines.

</div>
<div>

## Who is it for?

- **DJs and producers:** find the BPM of a track before dropping it into a mix.
- **Dancers and choreographers:** pick routines to match a song's tempo.
- **Fitness instructors:** build playlists that match workout intensity.
- **Music educators:** teach rhythm with concrete numbers.
- **Content creators:** cut video to a song's beat. Find the [BPM of a video](/video-bpm), then the [beat in frames](/bpm-to-frames).
- **Developers:** embed the same detection in your own app with the library below.

</div>
</div>

<aside class="home-limits">

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

</aside>

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
- [Beat Detection in the Browser with Web Audio](/guide/beat-detection-web-audio):
  onsets, tempo and beat tracking told apart, and which one this library answers.
- [BPM Detection in Node.js](/guide/node): the tempo of audio files outside
  the browser, one file or a whole folder.

See the [full developer guide](/guide/getting-started), the
[API reference](/api/), and the [examples](/examples/basic-usage) for file
analysis, microphone input, streaming audio, and framework integrations.
