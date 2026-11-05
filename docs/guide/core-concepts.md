---
title: 'Core Concepts: Real-Time vs Continuous BPM Analysis'
description: Understand realtime-bpm-analyzer's usage modes (real-time, continuous with auto-reset, and offline buffer analysis) and pick the right pattern for files, streams, or microphone input.
---

# Core Concepts

Understanding these core concepts will help you use Realtime BPM Analyzer effectively.

## Usage Modes

The library supports different usage patterns depending on your needs:

### Real-Time Analysis (Default)
Analyze audio while it's playing:

- Accumulates data throughout playback
- Provides increasingly accurate results
- No automatic reset
- Best for: Music players, video players, defined-length audio

```typescript
const analyzer = await createRealtimeBpmAnalyzer(audioContext);
// Analyzes continuously, and locks once the readings agree
```

### Continuous Analysis (Auto-Reset)
For long-running or infinite streams:

- Automatically starts over after a set stretch of audio
- Prevents memory buildup in 24/7 scenarios
- Follows a change of tempo
- Best for: Radio streams, live broadcasts, streaming services

```typescript
const analyzer = await createRealtimeBpmAnalyzer(audioContext, {
  // Start over every 20 seconds of audio
  engine: { name: 'peaks', restartAfterSeconds: 20 },
});
```

Each restart after a reading is a `statechange` to `listening` with reason `tempo-changed`. Only the `peaks` engine takes this option: the default `tempogram` engine's memory of past tempos fades with a 16-second half-life, so it follows a change on its own.

### Offline/Buffer Analysis
Analyze complete audio files without real-time constraints:

- Processes entire buffer at once
- Fastest results
- Best for: Local files, music libraries, batch processing

```typescript
import { analyzeFullBuffer } from 'realtime-bpm-analyzer';

const arrayBuffer = await (await fetch('/song.mp3')).arrayBuffer();
const buffer = await audioContext.decodeAudioData(arrayBuffer);
const reading = await analyzeFullBuffer(buffer);
console.log('BPM:', reading?.bpm ?? 'no tempo found');
```

## Audio Graph Architecture

The library uses the Web Audio API's node-based architecture:

```
┌─────────────┐
│ Audio Source│ (audio element, microphone, file)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Low-Pass   │ (peaks engine only - isolates bass)
│   Filter    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   BPM       │ (AudioWorkletProcessor)
│  Analyzer   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Destination │ (speakers)
└─────────────┘
```

### Why the Low-Pass Filter?

With the `peaks` engine, connecting the source to `analyzer.input` puts a low-pass filter in front of it (the same filter `getBiquadFilter()` builds). It:
- Isolates bass frequencies (typically where the beat is strongest)
- Reduces noise from high-frequency content
- Improves peak detection accuracy

To skip it or use your own filter, connect to `analyzer.node` instead, the analyzer with nothing in front of it. The default `tempogram` engine needs the full band, so its `.input` adds no filter. Connect to `analyzer.input` either way, and each engine gets what it needs.

## How BPM Detection Works

This is the `peaks` engine, the 5.x default and still available with `engine: 'peaks'`. The default `tempogram` engine reads the tempo from an onset tempogram instead: see [the tempogram engine](/guide/realtime-bpm-detection#the-tempogram-detector).

### 1. Peak Detection
The analyzer scans the audio signal at multiple amplitude **thresholds** (0.95, 0.90, 0.85... down to 0.20):

```
Amplitude
   1.0 ┤     ╭╮           threshold: 0.9
   0.9 ┤    ╭╯╰╮  ╭─╮     ← Peak detected here
   0.8 ┤   ╭╯  ╰──╯ ╰╮
   0.7 ┤  ╭╯         ╰╮
       └──────────────────→ Time
```

Lower thresholds detect more peaks, higher thresholds detect only strong peaks.

### 2. Interval Calculation
Once peaks are found, the analyzer calculates **time intervals** between them:

```
Peak 1    Peak 2    Peak 3    Peak 4
  |─────────|─────────|─────────|
    500ms     500ms     500ms
```

### 3. BPM Conversion
Intervals are converted to BPM:

```
BPM = 60,000 / interval_in_milliseconds
```

For the example above:
```
60,000 / 500 = 120 BPM
```

### 4. Tempo Grouping
The algorithm then:
- Folds each BPM into the tempo range (90-180 BPM by default) by doubling or halving
- Groups intervals that round to the same tempo
- Counts occurrences (votes)
- Reports the tempo with the most votes, with up to 4 runners-up

## BPM Candidates

Each result is a reading: one tempo, and the candidates behind it.

```typescript
const reading = {
  bpm: 128,
  bpmExact: 128.04,
  confidence: 0.46,
  candidates: [
    { bpm: 128, relation: 'top' },
    { bpm: 171, relation: 'other' },
    { bpm: 96, relation: 'other' },
  ],
  // ...and the audio it was measured on, and the engine
};
```

- **bpm**: The tempo to show, a whole number inside the tempo range. Always the first candidate's
- **bpmExact**: The same tempo before rounding, for timing work such as spacing beat markers
- **confidence**: From 0 to 1, uncalibrated for now. Each engine scores it its own way, so compare values from one engine only and set no fixed cut-off. It is not a probability
<!-- RBA-106: calibration gives confidence its meaning, or removes it. Update the line above then. -->
- **candidates**: Up to 5, the reading's own tempo first, the others in the engine's rank order. Each has a **relation** to the reading's tempo: `top`, `half`, `double` or `other`

The reading's `bpm` is usually the right one. A `half` or `double` candidate is the same beat at another octave.

## Threshold System

The `peaks` engine uses a **progressive threshold** system:

1. Starts at high threshold (0.95) - only strong peaks
2. If enough peaks found, calculates BPM
3. Each time it locks, it **raises the minimum threshold**
4. This makes future detection more selective

Benefits:
- Early results from strong beats
- Increasing accuracy over time
- Filters out weak/noise peaks

## Configuration Options

When creating the analyzer, you can customize behavior:

```typescript
const analyzer = await createRealtimeBpmAnalyzer(audioContext, {
  // The engine, with the settings only it understands
  engine: { name: 'peaks', restartAfterSeconds: 20 },

  // BPM range every tempo is reported in
  tempoRange: { min: 90, max: 180 },

  // Enable debug events
  debug: false,
});
```

### engine {#continuousanalysis}
- `'tempogram'` (default): spectral flux across several bands; see [the tempogram engine](/guide/realtime-bpm-detection#the-tempogram-detector)
- `'peaks'`: amplitude peaks after a low-pass filter, the 5.x default
- `{ name: 'peaks', restartAfterSeconds }`: start over every this many seconds of audio. Absent: never restarts
- `{ name: 'tempogram', mode: 'extension' }`: pins the measured settings, for tab capture

<a id="stabilizationtime"></a><a id="mutetimeinindexes"></a>

### tempoRange
- Default: `{ min: 90, max: 180 }`
- It picks the octave: the default reads an 85 BPM hip-hop track as 170, `{ min: 70, max: 140 }` reads it as 85
- `max` must be at least twice `min`; a narrower range throws a `RangeError`
- Keep the expected tempo away from the bounds: a tempo right on an edge jitters across it and its votes split between the two octaves
- `analyzeFullBuffer(buffer, { tempoRange })` takes the same option
- Both engines take it: `peaks` folds every tempo into it, the `tempogram` engine searches it and folds nothing

### debug
- `false` (default): No debug events
- `true`: Emits `debug` events, with engine detail whose shape changes with any release

## Events Reference

Besides its events, the analyzer has a state you can read at any time: `analyzer.state`. Its `status` is `listening`, `settling`, `locked` or `stopped`. Inside any listener, `state` is already current.

### `statechange`
Emitted on every change of status, and only then:

```typescript
analyzer.on('statechange', ({ from, to, reason }) => {
  console.log(`${from.status} to ${to.status} (${reason})`);
  if (to.status === 'locked') {
    console.log('Locked BPM:', to.reading.bpm);
  }
});
```

- `listening` to `settling`, reason `first-reading`: the first reading.
- `settling` to `locked`, reason `locked`: the readings agreed long enough. No sooner than about 11.5 seconds of audio with the default `tempogram` engine, 10 seconds with `peaks`.
- `locked` to `settling`, reason `unlocked`: the readings moved away.
- Back to `listening`: reason `pulse-lost` when no beat was heard for 2 seconds, `tempo-changed` when `restartAfterSeconds` started it over, `audio-lost` when a [`liveInput`](./realtime-bpm-detection.md#liveinput-for-a-mediastream) analyzer started over after losing audio, and `reset` after `reset()`. Anything it had locked on may no longer hold.

### `reading` {#bpm}
Emitted on every analysis step outside `listening`:

```typescript
analyzer.on('reading', (reading) => {
  console.log('BPM:', reading.bpm);
  console.log('Candidates:', reading.candidates.map(({ bpm, relation }) => `${bpm} (${relation})`));
});
```

<a id="bpmstable"></a><a id="analyzerreset"></a>

### `progress`
Emitted on each analysed chunk while `listening` (about every 93 ms at 44.1 kHz), with how close the analyzer is to its first reading. The default `tempogram` engine fills it over a 4-second warm-up. The `peaks` engine needs 16 peaks at one threshold, so with it quiet intros or tracks without kicks can take a while:

```typescript
const progressBar = document.querySelector('progress')!;

analyzer.on('progress', ({ fraction }) => {
  // A fraction from 0 to 1
  progressBar.value = fraction;
});
```

The step that would reach 1 moves to `settling` and sends the first `reading` instead. Progress starts again from `0` after `reset()` and after a start-over (reason `tempo-changed` or `audio-lost`). After `pulse-lost` the analyzer keeps what it has read, so progress stays at `1` while it listens for the beat again. `analyzer.state.progress` holds the same value while listening. It is always on, unlike the `debug` events.

### `error`
Emitted when one analysis step fails; the next step runs. A fatal fault is a `statechange` to `stopped` with reason `failed` instead.

```typescript
analyzer.on('error', ({ name, message }) => {
  console.error(name, message);
});
```

## Best Practices

### ✅ Do
- Connect the source to `analyzer.input`, which gives each engine what it needs (the low-pass filter for `peaks`, the full band for `tempogram`)
- Wait for the `statechange` to `locked` before displaying a final result
- Handle multiple candidates (show top 3-5)
- Create `AudioContext` on user interaction
- Call `stop()` when you are done: it is final, so create a new analyzer to listen again

### ❌ Don't
- Create `AudioContext` immediately on page load (autoplay restrictions)
- Assume the first reading is accurate (wait for the lock)
- Ignore the candidates' `relation` (a `half` or `double` is the same beat at another octave)
- Use continuous analysis for short audio clips

## Next Steps

Now that you understand the core concepts:

- [Basic Usage Examples →](/examples/basic-usage)
- [React Integration →](/examples/react)
- [Microphone Input →](/examples/microphone-input)
- [How It Works →](/guide/how-it-works)
- [Beat Detection with Web Audio →](/guide/beat-detection-web-audio)
