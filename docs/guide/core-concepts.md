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
const bpmAnalyzer = await createRealtimeBpmAnalyzer(audioContext);
// Analyzes continuously, accumulates confidence
```

### Continuous Analysis (Auto-Reset)
For long-running or infinite streams:

- Automatically resets after stabilization period
- Prevents memory buildup in 24/7 scenarios
- Best for: Radio streams, live broadcasts, streaming services

```typescript
const bpmAnalyzer = await createRealtimeBpmAnalyzer(audioContext, {
  continuousAnalysis: true,
  stabilizationTime: 20000 // Reset every 20 seconds
});
```

### Offline/Buffer Analysis
Analyze complete audio files without real-time constraints:

- Processes entire buffer at once
- Fastest results
- Best for: File uploads, music libraries, batch processing

```typescript
import { analyzeFullBuffer } from 'realtime-bpm-analyzer';

const buffer = await audioContext.decodeAudioData(arrayBuffer);
const tempos = await analyzeFullBuffer(buffer);
console.log('BPM:', tempos[0].tempo);
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
│  Low-Pass   │ (optional filter - isolates bass)
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

The optional `getBiquadFilter()` creates a low-pass filter that:
- Isolates bass frequencies (typically where the beat is strongest)
- Reduces noise from high-frequency content
- Improves peak detection accuracy

You can skip it if analyzing music with prominent high-frequency beats.

## How BPM Detection Works

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
- Normalizes BPM to common ranges (90-180 BPM)
- Groups similar tempos together
- Counts occurrences (confidence score)
- Returns top candidates sorted by confidence

## BPM Candidates

Results are returned as an array of candidates:

```typescript
[
  { tempo: 128, count: 45 },
  { tempo: 64,  count: 23 },
  { tempo: 96,  count: 12 }
]
```

- **tempo**: Detected BPM value
- **count**: Number of matching intervals (higher = more confident)

The **first candidate** (highest count) is usually the most accurate.

## Threshold System

The library uses a **progressive threshold** system:

1. Starts at high threshold (0.95) - only strong peaks
2. If enough peaks found, calculates BPM
3. If successful, **raises minimum threshold**
4. This makes future detection more selective and accurate

Benefits:
- Early results from strong beats
- Increasing accuracy over time
- Filters out weak/noise peaks

## Configuration Options

When creating the processor, you can customize behavior:

```typescript
const bpmAnalyzer = await createRealtimeBpmAnalyzer(audioContext, {
  // Enable continuous analysis with auto-reset
  continuousAnalysis: false,
  
  // Time before auto-reset (only if continuousAnalysis = true)
  stabilizationTime: 20000, // 20 seconds
  
  // Minimum time between peaks at same threshold (prevents double-detection)
  muteTimeInIndexes: 10000,
  
  // Enable debug events
  debug: false
});
```

### continuousAnalysis
- `false` (default): Accumulate data indefinitely
- `true`: Reset after `stabilizationTime` to prevent memory growth

### stabilizationTime
- Default: `20000` ms (20 seconds)
- Only used when `continuousAnalysis: true`
- Time until analyzer resets and starts fresh

### muteTimeInIndexes
- Default: `10000` samples
- Prevents detecting the same beat twice
- Adjust based on expected BPM range

### debug
- `false` (default): No debug events
- `true`: Emits additional events for debugging

## Events Reference

### `bpm`
Emitted continuously during analysis:

```typescript
analyzer.on('bpm', (data) => {
  // data.bpm: Array of tempo candidates
  // data.threshold: Current detection threshold
  console.log('BPM:', data.bpm[0].tempo);
  console.log('Threshold:', data.threshold);
});
```

### `bpmStable`
Emitted when stable BPM detected:

```typescript
analyzer.on('bpmStable', (data) => {
  // More confident detection
  console.log('Stable BPM:', data.bpm[0].tempo);
  console.log('Confidence:', data.bpm[0].count);
  console.log('Threshold:', data.threshold);
});
```

### `analyzerReset`
Emitted when continuous analysis resets:

```typescript
analyzer.on('analyzerReset', () => {
  console.log('Analyzer reset - starting fresh analysis');
});
```

## Best Practices

### ✅ Do
- Use low-pass filter for music with prominent bass
- Wait for `bpmStable` event before displaying final result
- Handle multiple candidates (show top 3-5)
- Create `AudioContext` on user interaction

### ❌ Don't
- Create `AudioContext` immediately on page load (autoplay restrictions)
- Assume first BPM event is accurate (wait for stability)
- Ignore the `count` property (it indicates confidence)
- Use continuous analysis for short audio clips

## Next Steps

Now that you understand the core concepts:

- [Basic Usage Examples →](/examples/basic-usage)
- [React Integration →](/examples/react)
- [Microphone Input →](/examples/microphone-input)
- [How It Works →](/guide/how-it-works)
