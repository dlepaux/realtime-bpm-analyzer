---
title: How BPM Detection Works
description: 'How realtime-bpm-analyzer finds the tempo: the AudioWorklet pipeline, the default tempogram engine, the peaks engine, its events, timing and limits.'
---

# How It Works

What happens between the audio going in and a reading coming out, so you know what to expect from it.

## Overview

The library listens in an `AudioWorklet`, on the browser's audio thread, and has two engines:

- **`tempogram`**, the default, measures how the spectrum changes from moment to moment in five frequency bands,
  and finds the tempo that repeats in those changes.
- **`peaks`**, the default of 5.x, keeps the bass, finds where the signal peaks above a threshold, and turns the
  time between peaks into tempos. `engine: 'peaks'` selects it.

Both rank up to five candidate tempos and report the same kind of reading: the tempo, a confidence and the
candidates.

## Architecture

### Audio Processing Pipeline

```
Audio source: media element, stream or microphone
    ↓
analyzer.input: nothing for tempogram, a 200 Hz low-pass for peaks
    ↓
AudioWorklet processor, on the audio thread
    ↓
Engine: tempogram (default) or peaks
    ↓
Reading: tempo, confidence, up to 5 candidates
    ↓
Events: reading, statechange, progress, kick, error
```

`analyzeFullBuffer`, and `analyzeChannelData` in Node, run the same engines on a whole decoded file at once,
without the worklet, and return one reading, or `null` when there is no clear beat.

### Key Components

1. **AudioWorklet**: runs the analysis off the main thread, so the page stays responsive
2. **The engine**: `tempogram` or `peaks`, below
3. **Candidate ranking**: up to five tempos, the first of which is the reading
4. **Confidence**: each engine's raw score, mapped to one shared scale
5. **State**: `listening`, `settling`, then `locked` once the readings agree

## The tempogram engine

The default engine, step by step:

1. **Onset strength.** It splits the audio into five bands, from 30 Hz to 10 kHz, and measures how much each
   band's energy rises from one frame to the next, a hundred times a second. Sudden rises are where notes and
   drums start.
2. **Tempogram.** Every half second, it looks at the last 8 seconds of that onset strength and asks which time
   between beats makes it repeat best (an autocorrelation).
3. **Tempo prior.** It weighs each tempo by how likely music is to sit there, rather than folding every tempo
   into one octave.
4. **Memory.** It adds each new tempogram to what it heard before, with a 16-second half-life, so the reading
   steadies over time and still follows a tempo change.

Its first reading comes after 4 seconds of audio. It searches 90 to 180 BPM unless you set `tempoRange`:
[the tempogram engine](/guide/realtime-bpm-detection#the-tempogram-detector) says what that range changes.

## The peaks engine {#the-algorithm}

This is the `peaks` engine, the 5.x default, which `engine: 'peaks'` selects. The code below sketches each step;
it is not the library's API.

### Step 1: Audio Capture

The library receives audio data in real-time through the Web Audio API:

<!-- typecheck: skip, a sketch of the engine's internals, not the library's API -->
```typescript
// Data arrives in chunks via AudioWorkletProcessor
process(inputs: Float32Array[][], outputs: Float32Array[][]) {
  const input = inputs[0][0]; // First channel
  // Process audio samples...
}
```

### Step 2: Peak Detection

The algorithm scans the audio signal looking for peaks - points where the signal strength exceeds a threshold:

<!-- typecheck: skip, a sketch of the engine's internals, not the library's API -->
```typescript
function findPeaksAtThreshold(data, threshold) {
  const peaks = [];
  const skipForwardIndexes = computeIndexesToSkip(0.25, sampleRate);
  
  for (let i = 0; i < data.length; i++) {
    if (data[i] > threshold) {
      peaks.push(i);
      i += skipForwardIndexes; // Skip ~0.25s to ignore descending phase
    }
  }
  
  return peaks;
}
```

**Why skip forward?** When a beat occurs, the signal rises then falls. Skipping ~0.25 seconds prevents counting the same beat multiple times.

### Step 3: Multiple Thresholds

The algorithm tests multiple threshold levels (from high to low sensitivity) to find the optimal detection level:

<!-- typecheck: skip, a sketch of the engine's internals, not the library's API -->
```typescript
// The descending scan checks thresholds from 0.95 down to 0.20 in 0.05 steps
for (let threshold = 0.95; threshold >= 0.2; threshold -= 0.05) {
  const peaks = findPeaksAtThreshold(data, threshold);
  
  if (peaks.length > minPeaks) {
    // Found enough peaks, use this threshold
    break;
  }
}
```

This ensures the algorithm works with:
- Loud, heavily compressed tracks (high threshold)
- Quiet, dynamic recordings (low threshold)
- Everything in between

### Step 4: Interval Calculation

Once peaks are identified, the algorithm calculates the time intervals between consecutive peaks:

<!-- typecheck: skip, a sketch of the engine's internals, not the library's API -->
```typescript
function computeIntervals(peaks, sampleRate) {
  const intervals = [];
  
  for (let i = 0; i < peaks.length - 1; i++) {
    const interval = (peaks[i + 1] - peaks[i]) / sampleRate * 1000; // in ms
    intervals.push(interval);
  }
  
  return intervals;
}
```

### Step 5: Tempo Grouping

The analyzer compares each detected peak with up to the next nine peaks. It converts each sample interval to BPM, folds it into the tempo range (90 to 180 by default, set with the `tempoRange` option) by doubling or halving, rounds it to an integer, and groups intervals with the same rounded BPM. It does not merge tempos using a percentage tolerance.

<!-- typecheck: skip, a sketch of the engine's internals, not the library's API -->
```typescript
function groupByTempo(intervalCounts, sampleRate, {min, max} = {min: 90, max: 180}) {
  const groups = new Map();

  for (const {interval, count} of intervalCounts) {
    if (interval === 0) continue;

    let tempo = 60 / (Math.abs(interval) / sampleRate);
    while (tempo < min) tempo *= 2;
    while (tempo > max) tempo /= 2;
    tempo = Math.round(tempo);

    groups.set(tempo, (groups.get(tempo) ?? 0) + count);
  }

  return groups; // tempo → count
}
```

### Step 6: Candidate Ranking

BPM candidates are sorted by **count** (how many interval comparisons resolve to that rounded tempo), and the top 5 are kept. The first is the reading's `bpm`. The reading also gets a `confidence`: the share of all votes, across every tempo group, that land within ±1 BPM of its tempo. Pooling the neighbours absorbs rounding jitter, since a true 128 BPM splits its votes over 127 to 129.

<!-- typecheck: skip, a sketch of the engine's internals, not the library's API -->
```typescript
function getBPMCandidates(groups) {
  const totalVotes = [...groups.values()].reduce((sum, count) => sum + count, 0);

  return [...groups]
    .map(([tempo, count]) => {
      const support = (groups.get(tempo - 1) ?? 0) + count + (groups.get(tempo + 1) ?? 0);
      return {tempo, count, confidence: support / totalVotes};
    })
    .sort((a, b) => b.count - a.count) // Most common first
    .slice(0, 5);
}
```

A perfect click track scores about **0.46**, not 1: each peak is paired with the next nine, and only pairs 1, 2, 4 and 8 beats apart fold back onto the beat tempo. Randomly spaced peaks score below 0.1. In plain words: the score says how much the peaks agree on one tempo, and even a perfect beat agrees only about halfway. This raw score is not what a reading reports. The library maps it, through a table calibrated on licence-clean dev data from 90 to 180 BPM, to the estimated chance the reading is right, and does the same with the `tempogram` engine's own score, so inside that range `confidence` means the same whichever engine measured it. Outside it, or on a custom `tempoRange`, which changes what each engine picks, `confidence` is `null`: unmeasured.

## Signal Processing Features

### Low-Pass Filtering

With the `peaks` engine, `analyzer.input` puts a low-pass filter in front of the analyzer, the same one `getBiquadFilter()` builds. The default `tempogram` engine needs the full band, so there `.input` holds nothing. The filter:
- Removes high frequencies (treble)
- Emphasizes bass frequencies (where beats typically occur)

**Frequency Response:**
- **Frequency**: 200 Hz cutoff (whole-file analysis can set its own: `engine: { name: 'peaks', lowpass: { frequency, q } }`)
- **Q**: 1 dB of resonance at the cutoff, as Web Audio reads a lowpass `Q` (not a linear Q factor)
- **Type**: Lowpass

This helps isolate kick drums and bass elements that carry the rhythm.

### Why It Works

Most music has a strong rhythmic element in the bass range (60-150 Hz):
- **Kick drums**: ~60-100 Hz
- **Bass guitar**: ~40-200 Hz
- **Electronic bass**: ~50-150 Hz

Filtering out higher frequencies reduces false positives from:
- Hi-hats and cymbals
- Vocals
- Melodic instruments

## Event System

The analyzer reports through a state, `analyzer.state`, and events. Its `status` moves from `listening` to `settling` at the first reading, and to `locked` once the readings agree.

### `reading` Event {#bpm-event}

Emitted on every analysis step outside `listening`:
```typescript
analyzer.on('reading', (reading) => {
  console.log('Current BPM:', reading.bpm);
  console.log('Candidates:', reading.candidates.map(({ bpm, relation }) => `${bpm} (${relation})`));
});
```

**Characteristics:**
- Updates frequently (every half second with the default `tempogram` engine, about ten times a second with `peaks`)
- May fluctuate as more data arrives
- Useful for progressive display

### `statechange` to `locked` {#bpmstable-event}

Emitted when the readings agree:
```typescript
analyzer.on('statechange', ({ to }) => {
  if (to.status === 'locked') {
    console.log('Locked BPM:', to.reading.bpm);
  }
});
```

**Characteristics:**
- Comes once the readings agree long enough
- Requires sufficient data collection: never before about 11.5 seconds of audio with the default
  `tempogram` engine, or 10 seconds with `peaks` (or a shorter `restartAfterSeconds`)
- With `peaks`, each lock raises the minimum threshold, so later locks rest on stronger peaks
- Best for final BPM determination
- The tempo can still move a little while locked, so keep showing the latest reading

## Performance Optimizations

### AudioWorklet Threading

AudioWorklet runs on a separate audio rendering thread:
- **Doesn't block UI**: Analysis runs independently
- **Real-time priority**: Gets CPU time when needed
- **Low latency**: Processes audio as it arrives

### Long Listens

Memory and the work per chunk stay bounded however long the analyzer listens. The `peaks` engine keeps only the
newest 256 peaks at each threshold, so its reading follows the latest 50 seconds or more of audio. The default
`tempogram` engine's memory of past tempos fades with a 16-second half-life.

To have `peaks` follow a tempo change sooner, start it over at a set period:
```typescript
createRealtimeBpmAnalyzer(audioContext, {
  engine: { name: 'peaks', restartAfterSeconds: 20 }, // Starts over every 20 seconds of audio
});
```

### Data Buffering

The processor gathers audio before it reports:
- **First reading**: after a 4-second warm-up with the default `tempogram` engine; `peaks` waits for 16 peaks at one threshold
- **Lock**: no sooner than about 11.5 seconds of audio with `tempogram`, 10 seconds with `peaks` (or a shorter `restartAfterSeconds`)
- **Trade-off**: a shorter `restartAfterSeconds` follows a tempo change sooner, and gives each reading less audio

## Limitations & Edge Cases

### Complex Time Signatures

The algorithm works best with:
- 4/4 time (most popular music)
- Simple rhythms
- It may struggle with 5/4, 7/8, or polyrhythmic music

### Tempo Changes

- **Fixed tempo**: Where it works best
- **Slight variations**: The evidence spreads across neighbouring tempos, so the reading can be less clear
- **Major changes**: The reading follows after a while: `tempogram`'s memory of past tempos fades with a 16-second half-life, and `peaks` follows sooner with `restartAfterSeconds`

## Further Reading

- [Web Audio API Specification](https://www.w3.org/TR/webaudio/)
- [AudioWorklet Guide](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
- [Digital Signal Processing Basics](https://en.wikipedia.org/wiki/Digital_signal_processing)

## Next Steps

- [Beat Detection with Web Audio](/guide/beat-detection-web-audio) - Onsets, tempo and beat tracking, and where this library fits
- [Performance Tips](/guide/performance) - Optimize for your use case
- [Browser Compatibility](/guide/browser-compatibility) - Platform support details
- [Examples](/examples/basic-usage) - Practical implementations
