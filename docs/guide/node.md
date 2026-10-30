---
title: BPM Detection in Node.js — Analyse Decoded Audio Without Web Audio
description: Detect the tempo of audio files in Node.js, Bun or Deno with the realtime-bpm-analyzer/node entry point. Pass decoded PCM samples and get the same BPM candidates as analyzeFullBuffer in the browser.
---

# BPM Detection in Node.js

`realtime-bpm-analyzer/node` runs the offline analysis outside the browser, in
Node.js, Bun or Deno. It needs no Web Audio API and adds no dependency: you
pass decoded samples and get tempo candidates back.

```typescript
import {analyzeChannelData} from 'realtime-bpm-analyzer/node';

// channelData: a Float32Array of samples in [-1, 1], from any decoder
const tempos = await analyzeChannelData(channelData, 44100);

console.log('Detected BPM:', tempos[0]?.tempo);
```

CommonJS works too: `const {analyzeChannelData} = require('realtime-bpm-analyzer/node')`.

In TypeScript, the subpath needs a `moduleResolution` that reads package `exports`
(`node16`, `nodenext` or `bundler`), and the shared type declarations mention
`URL`, so keep `@types/node` (or the DOM lib) in the project, as Node projects
usually do.

## Same results as the browser

`analyzeChannelData` is the Node counterpart of
`analyzeFullBuffer`. The browser version
lowpasses the audio with a Web Audio `BiquadFilterNode`. The Node version uses a
plain JavaScript biquad with the coefficients the Web Audio specification
defines for that node, then runs the same peak detection and tempo grouping.

The test suite checks this on every change:

- the filter output matches Chromium's `OfflineAudioContext` render within
  `1e-5` per sample (measured at most `1.4e-6`), and its magnitude response matches
  `getFrequencyResponse`
- on the test fixture and on click tracks from 90 to 174 BPM, both functions
  return identical candidates: same tempos, counts and confidences

`analyzeFullBuffer` analyses the first channel of the buffer. Pass channel 0 to
reproduce it exactly, or a mono downmix of your own.

## Decoding the audio

The entry point takes samples, not files, so you choose the decoder. A WAV reader,
an ffmpeg pipe (`-f f32le -ac 1`) or any package that returns a `Float32Array`
works. Keep the file's sample rate, or pass the rate you resampled to.
To analyse files without writing any code, use the [command line](./cli).

## Options

The third argument takes the same options as `analyzeFullBuffer`:

| Option           | Default         | Meaning                                                   |
| ---------------- | --------------- | --------------------------------------------------------- |
| `frequencyValue` | `200`           | Lowpass cutoff in Hz                                      |
| `qualityValue`   | `1`             | Lowpass Q, in dB as Web Audio reads it                    |
| `tempoRange`     | `{90, 180}`     | Range the tempos fold into; `max` must be at least 2 × `min` |

```typescript
const tempos = await analyzeChannelData(channelData, sampleRate, {
  tempoRange: {min: 70, max: 140}, // report 87 rather than 174
});
```

It resolves to up to 5 candidates sorted by `count`, each with `tempo`,
`count` and `confidence` (the `Tempo` type in the [API reference](/api/)). Silence or
audio without a clear beat resolves to an empty array.

It throws when `channelData` is not a non-empty `Float32Array`, and throws a
`RangeError` for a sample rate that is not positive, a filter option that is not
a finite number, or an invalid `tempoRange`.

## The filter on its own

`applyLowpass(channelData, sampleRate, options?)` is exported too. It returns a
new `Float32Array` filtered like the browser pipeline, and leaves the input
untouched.
