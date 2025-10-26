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
5. **Confidence Scoring**: Ranks BPM candidates by reliability

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
// Try thresholds from 0.9 down to 0.3
for (let threshold = 0.9; threshold >= 0.3; threshold -= 0.05) {
  const peaks = findPeaksAtThreshold(data, threshold);
  
  if (peaks.length >= minPeaks) {
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

Intervals are grouped by tempo, allowing slight variations (within ±5%):

```typescript
function groupByTempo(intervals) {
  const groups = [];
  
  for (const interval of intervals) {
    const tempo = Math.round(60000 / interval); // Convert to BPM
    
    // Find existing group or create new one
    let group = groups.find(g => 
      Math.abs(g.tempo - tempo) / tempo < 0.05 // 5% tolerance
    );
    
    if (!group) {
      group = { tempo, count: 0, intervals: [] };
      groups.push(group);
    }
    
    group.count++;
    group.intervals.push(interval);
  }
  
  return groups;
}
```

### Step 6: Candidate Ranking

BPM candidates are sorted by:
1. **Count** (how many intervals match this tempo)
2. **Consistency** (how stable the intervals are)

```typescript
function getBPMCandidates(groups) {
  return groups
    .sort((a, b) => b.count - a.count) // Most common first
    .map(group => ({
      tempo: Math.round(group.tempo),
      count: group.count,
      confidence: calculateConfidence(group)
    }));
}
```

## Signal Processing Features

### Low-Pass Filtering

The optional `getBiquadFilter()` function creates a low-pass filter that:
- Removes high frequencies (treble)
- Emphasizes bass frequencies (where beats typically occur)
- Improves detection accuracy

**Frequency Response:**
- **Frequency**: 150 Hz cutoff
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

### BPM Event

Emitted continuously during analysis:
```typescript
{
  message: 'BPM',
  data: {
    bpm: [
      { tempo: 128, count: 45 },
      { tempo: 64, count: 23 }
    ]
  }
}
```

**Characteristics:**
- Updates frequently (every ~1-2 seconds)
- May fluctuate as more data arrives
- Useful for progressive display

### BPM_STABLE Event

Emitted when confident detection is achieved:
```typescript
{
  message: 'BPM_STABLE',
  data: {
    bpm: [
      { tempo: 128, count: 150 }
    ]
  }
}
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
createRealTimeBpmProcessor(audioContext, {
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

## Technical Constants

```typescript
// Minimum peaks required for analysis
MIN_PEAKS = 30

// Threshold range
THRESHOLD_MIN = 0.3
THRESHOLD_MAX = 0.9
THRESHOLD_STEP = 0.05

// Skip duration after peak
SKIP_DURATION = 0.25 // seconds

// Tempo grouping tolerance
TEMPO_TOLERANCE = 0.05 // 5%

// Valid BPM range
MIN_BPM = 60
MAX_BPM = 200
```

## Further Reading

- [Web Audio API Specification](https://www.w3.org/TR/webaudio/)
- [AudioWorklet Guide](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
- [Digital Signal Processing Basics](https://en.wikipedia.org/wiki/Digital_signal_processing)

## Next Steps

- [Performance Tips](/guide/performance) - Optimize for your use case
- [Browser Compatibility](/guide/browser-compatibility) - Platform support details
- [Examples](/examples/basic-usage) - Practical implementations
