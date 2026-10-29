---
title: How BPM Detection Works — Algorithm and Audio Pipeline
description: How realtime-bpm-analyzer detects tempo — Web Audio API decoding, low-pass filtering, AudioWorklet peak detection, interval analysis. Architecture and algorithm explained.
---

# How It Works

Understanding the technical approach behind Realtime BPM Analyzer helps you make better decisions when implementing it in your projects.

## Overview

The library uses the **Web Audio API** to analyze audio signals and detect rhythmic patterns. The core algorithm identifies "peaks" in the audio signal that correspond to beats, then analyzes the intervals between these peaks to determine tempo.

## Architecture

### Audio Processing Pipeline

```
Audio Source
    ↓
Media Element Source / Stream / Buffer
    ↓
Low-Pass Filter (optional, recommended)
    ↓
AudioWorklet Processor
    ↓
Peak Detection & Analysis
    ↓
BPM Candidates
```

### Key Components

1. **AudioWorklet**: Runs analysis on a separate thread for better performance
2. **Peak Detection**: Identifies rhythmic patterns in the audio signal
3. **Threshold Analysis**: Tests multiple sensitivity levels to find optimal peaks
4. **Interval Grouping**: Groups similar intervals to identify tempo patterns
5. **Candidate Ranking**: Ranks BPM candidates by vote count and scores their confidence

## The Algorithm

### Step 1: Audio Capture

The library receives audio data in real-time through the Web Audio API:

```typescript
// Data arrives in chunks via AudioWorkletProcessor
process(inputs: Float32Array[][], outputs: Float32Array[][]) {
  const input = inputs[0][0]; // First channel
  // Process audio samples...
}
```

### Step 2: Peak Detection

The algorithm scans the audio signal looking for peaks - points where the signal strength exceeds a threshold:

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

```typescript
// The descending scan checks thresholds from 0.90 down to 0.20 in 0.05 steps
for (let threshold = 0.9; threshold >= 0.2; threshold -= 0.05) {
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

The analyzer compares each detected peak with up to the next nine peaks. It converts each sample interval to BPM, folds it into the tempo range (90–180 by default, set with the `tempoRange` option) by doubling or halving, rounds it to an integer, and groups intervals with the same rounded BPM. It does not merge tempos using a percentage tolerance.

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

BPM candidates are sorted by **count** (how many interval comparisons resolve to that rounded tempo), and the top 5 are returned. Each one also gets a `confidence`: the share of all votes, across every tempo group, that land within ±1 BPM of it. Pooling the neighbours absorbs rounding jitter, since a true 128 BPM splits its votes over 127–129.

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

A perfect click track scores about **0.46**, not 1: each peak is paired with the next nine, and only pairs 1, 2, 4 and 8 beats apart fold back onto the beat tempo. Randomly spaced peaks score below 0.1. No absolute cut-off has been calibrated on real music yet, so compare values rather than test them against a fixed number.

## Signal Processing Features

### Low-Pass Filtering

The optional `getBiquadFilter()` function creates a low-pass filter that:
- Removes high frequencies (treble)
- Emphasizes bass frequencies (where beats typically occur)
- Improves detection accuracy

**Frequency Response:**
- **Frequency**: 200 Hz cutoff by default (configurable)
- **Q Factor**: 1 (mild slope)
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

### `bpm` Event

Emitted continuously during analysis:
```typescript
analyzer.on('bpm', (data) => {
  // data.bpm: Array of tempo candidates
  // data.threshold: Detection threshold used
  console.log('Current BPM:', data.bpm[0].tempo);
  console.log('Count:', data.bpm[0].count);
});
```

**Characteristics:**
- Updates frequently (every ~1-2 seconds)
- May fluctuate as more data arrives
- Useful for progressive display

### `bpmStable` Event

Emitted when confident detection is achieved:
```typescript
analyzer.on('bpmStable', (data) => {
  // More reliable, higher confidence result
  console.log('Stable BPM:', data.bpm[0].tempo);
  console.log('Votes:', data.bpm[0].count, 'Confidence:', data.bpm[0].confidence);
});
```

**Characteristics:**
- More reliable result
- Requires sufficient data collection
- Threshold increases over time for better accuracy
- Best for final BPM determination

## Performance Optimizations

### AudioWorklet Threading

AudioWorklet runs on a separate audio rendering thread:
- **Doesn't block UI**: Analysis runs independently
- **Real-time priority**: Gets CPU time when needed
- **Low latency**: Processes audio as it arrives

### Memory Management

For continuous analysis (streams):
```typescript
createRealtimeBpmAnalyzer(audioContext, {
  continuousAnalysis: true,
  stabilizationTime: 20000 // Clear data every 20 seconds
});
```

This prevents memory leaks in long-running analysis.

### Data Buffering

The processor accumulates audio data before analysis:
- **Minimum requirement**: ~10 seconds at 90 BPM
- **Better accuracy**: 20+ seconds of data
- **Trade-off**: Speed vs accuracy

## Limitations & Edge Cases

### Complex Time Signatures

The algorithm works best with:
- ✅ 4/4 time (most popular music)
- ✅ Simple rhythms
- ⚠️ May struggle with 5/4, 7/8, or polyrhythmic music

### Tempo Changes

- **Fixed tempo**: Excellent accuracy
- **Slight variations**: Handles well (±5% tolerance)
- **Major changes**: May report multiple candidates or incorrect BPM

### Audio Quality

- **Clear recordings**: Best results
- **Compressed/loud**: Works well
- **Very quiet**: May need lower threshold
- **Heavy noise**: Use low-pass filter

## Further Reading

- [Web Audio API Specification](https://www.w3.org/TR/webaudio/)
- [AudioWorklet Guide](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
- [Digital Signal Processing Basics](https://en.wikipedia.org/wiki/Digital_signal_processing)

## Next Steps

- [Performance Tips](/guide/performance) - Optimize for your use case
- [Browser Compatibility](/guide/browser-compatibility) - Platform support details
- [Examples](/examples/basic-usage) - Practical implementations
