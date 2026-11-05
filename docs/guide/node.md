---
title: BPM Detection in Node.js
description: BPM detection in Node.js, Bun or Deno with realtime-bpm-analyzer/node. Get the tempo of MP3, WAV or FLAC files, one file or a folder, as JSON.
---

# BPM Detection in Node.js

`realtime-bpm-analyzer/node` runs the offline analysis outside the browser, in
Node.js, Bun or Deno. It needs no Web Audio API and adds no dependency: you
pass decoded samples and get a reading back, the same shape the browser gives.

```typescript
import {analyzeChannelData} from 'realtime-bpm-analyzer/node';

// channelData: a Float32Array of samples in [-1, 1], from any decoder
const reading = await analyzeChannelData(channelData, 44100);

console.log('Detected BPM:', reading?.bpm);
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
  return the same reading: same `bpm` and candidates, and the same
  `bpmExact` and `confidence` within `1e-9`

Pass channel 0 to match `analyzeFullBuffer`, which reads the first channel, or
a mono downmix of your own.

## Decoding the audio

The entry point takes samples, not files, so you choose the decoder. A WAV reader,
an ffmpeg pipe or any package that returns a `Float32Array` works. Keep the file's
sample rate, or pass the rate you resampled to.

## Get the tempo of an audio file

[ffmpeg](https://ffmpeg.org/) reads most formats (MP3, WAV, FLAC, OGG, M4A and
more) and can write them as raw 32-bit float samples. This module asks it for mono
samples at 44.1 kHz. It needs `ffmpeg` on the `PATH`. Save it as `decode.mjs`:

```javascript
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const run = promisify(execFile);
export const SAMPLE_RATE = 44100;

/** Decodes an audio file to mono float samples with ffmpeg. */
export async function decode(path) {
  const {stdout} = await run('ffmpeg', [
    '-v', 'error', '-i', path,
    '-f', 'f32le', '-ac', '1', '-ar', String(SAMPLE_RATE), '-',
  ], {encoding: 'buffer', maxBuffer: 512 * 1024 * 1024}); // about 50 minutes of mono audio

  // Copy into a fresh ArrayBuffer: a Float32Array view needs a 4-byte aligned offset.
  const bytes = stdout.buffer.slice(stdout.byteOffset, stdout.byteOffset + stdout.byteLength);
  return new Float32Array(bytes);
}
```

Then, with the library installed (`npm install realtime-bpm-analyzer`), `bpm.mjs`:

<!-- typecheck: skip, imports decode.mjs from the block above -->
```javascript
import {analyzeChannelData} from 'realtime-bpm-analyzer/node';
import {decode, SAMPLE_RATE} from './decode.mjs';

const reading = await analyzeChannelData(await decode(process.argv[2]), SAMPLE_RATE);
console.log(reading ? `${reading.bpm} BPM` : 'no clear beat');
```

```bash
node bpm.mjs song.mp3
```

`-ac 1` is ffmpeg's mono downmix of all channels. To match `analyzeFullBuffer`,
which reads the first channel, replace `'-ac', '1'` with `'-af', 'pan=mono|c0=c0'`. The browser decodes at the audio
context's sample rate, so its samples can still differ slightly from ffmpeg's.

## A folder, as JSON

The same decoder over every audio file in a folder, one level deep, printed as one
JSON array. A file ffmpeg can't read is listed with its error, and the others carry
on. Save it as `bpm-folder.mjs`:

<!-- typecheck: skip, imports decode.mjs from the block above -->
```javascript
import {readdir} from 'node:fs/promises';
import {extname, join} from 'node:path';
import {analyzeChannelData} from 'realtime-bpm-analyzer/node';
import {decode, SAMPLE_RATE} from './decode.mjs';

const AUDIO = new Set(['.mp3', '.wav', '.flac', '.ogg', '.oga', '.opus', '.m4a', '.aac']);
const folder = process.argv[2] ?? '.';
const names = (await readdir(folder)).filter((name) => AUDIO.has(extname(name).toLowerCase()));

const results = [];
for (const name of names) {
  try {
    const reading = await analyzeChannelData(await decode(join(folder, name)), SAMPLE_RATE);
    results.push({file: name, bpm: reading?.bpm ?? null, candidates: reading?.candidates ?? []});
  } catch (error) {
    results.push({file: name, error: String(error)});
  }
}

console.log(JSON.stringify(results, null, 2));
```

```bash
node bpm-folder.mjs ~/Music/set > tempos.json
```

Files are analysed one after another, so memory holds one decoded file at a time.
`bpm` is `null` for a file without a clear beat.

## Options

The third argument takes the same options as `analyzeFullBuffer`:

| Option       | Default     | Meaning                                                   |
| ------------ | ----------- | --------------------------------------------------------- |
| `engine`     | `'tempogram'` | `'tempogram'` reads spectral flux across bands, with no lowpass. `'peaks'` reads amplitude peaks after a lowpass, and `{name: 'peaks', lowpass: {frequency, q}}` sets it, by default 200 Hz and Q 1 (in dB, as Web Audio reads it) |
| `tempoRange` | `{90, 180}` | Range the tempos are reported in: `peaks` folds into it, `tempogram` searches it; `max` must be at least 2 × `min` |

```typescript
import {analyzeChannelData} from 'realtime-bpm-analyzer/node';

const reading = await analyzeChannelData(channelData, sampleRate, {
  tempoRange: {min: 70, max: 140}, // report 87 rather than 174
});
```

It resolves to one reading (the `Reading` type in the [API reference](/api/)):
the tempo to show, `bpm`, its unrounded value, `bpmExact`, and up to 5
`candidates`, each with a `bpm` and its `relation` to that tempo. Silence or
audio without a clear beat resolves to `null`.

It throws when `channelData` is not a non-empty `Float32Array`, and throws a
`RangeError` for a sample rate that is not positive, a lowpass setting that is not
a finite number, an invalid `tempoRange` or an unknown `engine`. A 5.x option
(`detector`, `frequencyValue`, `qualityValue`) throws a `TypeError` that names its
replacement.

## The filter on its own

`applyLowpass(channelData, sampleRate, options?)` is exported too. It returns a
new `Float32Array` filtered like the browser pipeline, and leaves the input
untouched.
