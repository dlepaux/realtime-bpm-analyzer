---
title: Performance Tips for Browser BPM Detection
description: 'Optimise realtime-bpm-analyzer for accuracy, latency, and battery life: AudioWorklet, low-pass filtering, threshold tuning and mobile browsers.'
---

# Performance Tips

Tune Realtime BPM Analyzer for speed and reliable readings in your application.

## General Best Practices

### 1. Use AudioWorklet (Already Built-in)

The library automatically uses **AudioWorklet** instead of ScriptProcessorNode:

✅ **Advantages:**
- Runs on a separate audio thread (doesn't block UI)
- More consistent timing
- Lower latency
- Better battery life on mobile

No configuration needed - this is handled automatically by `createRealtimeBpmAnalyzer()`.

### 2. Apply Low-Pass Filtering

Connect the source to `analyzer.input`. With the default `peaks` engine it holds the 200 Hz low-pass filter (the one `getBiquadFilter` builds); with `tempogram` it holds nothing, since that engine needs the full band:

```typescript
import { createRealtimeBpmAnalyzer } from 'realtime-bpm-analyzer';

const analyzer = await createRealtimeBpmAnalyzer(audioContext);

// The low-pass filter comes with the input
source.connect(analyzer.input);
```

**What it does:**
- 🎯 Keeps the kick and bass, where most beats sit
- 🎵 Fewer false peaks from vocals, hi-hats and other high sounds

### 3. Choose the Right Analysis Mode

Pick the mode that matches your use case:

| Use Case | Mode | Memory | CPU |
|----------|------|--------|-----|
| Audio/Video Player | Real-time | Low | Low |
| Radio Stream | Continuous | Medium | Medium |
| Local File | Offline | High | High |

#### Real-time Mode

```typescript
const analyzer = await createRealtimeBpmAnalyzer(audioContext);
```

- **Memory**: Grows with playback time
- **CPU**: Consistent low usage
- **Use for**: Songs with fixed length

#### Continuous Mode

```typescript
const analyzer = await createRealtimeBpmAnalyzer(audioContext, {
  engine: { name: 'peaks', restartAfterSeconds: 20 }, // Clear data every 20 s of audio
});
```

- **Memory**: Bounded by `restartAfterSeconds`
- **CPU**: Periodic spikes during cleanup
- **Use for**: Infinite streams, radio, live input

#### Offline Mode

```typescript
import { analyzeFullBuffer } from 'realtime-bpm-analyzer';

const reading = await analyzeFullBuffer(audioBuffer);
```

- **Memory**: Entire file in memory
- **CPU**: One-time burst
- **Use for**: File analysis, batch processing

## Memory Management

### Continuous Analysis Settings

For long-running applications (streams, radio, microphone):

```typescript
createRealtimeBpmAnalyzer(audioContext, {
  engine: { name: 'peaks', restartAfterSeconds: 20 }, // Adjust based on needs
});
```

The `tempogram` engine has no restart option: its memory of past tempos fades with a 16-second half-life.

**Restart Period Guidelines:**

| Audio Type | Restart After | Reason |
|------------|------------------|--------|
| Electronic (EDM) | 15 s | Simple, consistent beats |
| Pop/Rock | 20 s | Standard complexity |
| Jazz/Complex | 30 s | Variable rhythms |
| Classical | 40 s | Tempo changes |

A restart period under 10 s also brings the earliest lock forward to fit before it, as the default engine otherwise waits 10 s of audio before it locks.

**Memory Impact:**
- Lower = less memory, less audio to settle on, follows tempo changes sooner
- Higher = more memory, more audio to settle on, follows tempo changes later

### Clean Up Resources

Always clean up when done:

```typescript
// Stop analysis. stop() is final: create a new analyzer to listen again
analyzer.stop();

// Disconnect the source
source.disconnect();

// Close the context if no longer needed
await audioContext.close();
```

## CPU Optimization

### 1. Avoid Redundant Analysis

Don't create multiple analyzers for the same source:

❌ **Bad:**
```typescript
// Creating analyzers in a loop
setInterval(async () => {
  const analyzer = await createRealtimeBpmAnalyzer(audioContext);
  // ...
}, 1000);
```

✅ **Good:**
```typescript
// Create once, reuse
const analyzer = await createRealtimeBpmAnalyzer(audioContext);
// Listen for events over time
```

### 2. Buffer Size Considerations

The AudioWorklet automatically uses optimal buffer sizes, but you can check:

```typescript
// Check the AudioContext's buffer size
console.log('Buffer size:', audioContext.baseLatency);
```

**Lower buffer** = Lower latency, higher CPU
**Higher buffer** = Higher latency, lower CPU

Most devices default to 128-256 samples, which is optimal.

### 3. Throttle UI Updates

Don't update the UI on every reading:

❌ **Bad:**
```typescript
analyzer.on('reading', (reading) => {
  // Updates too frequently!
  bpmDisplay.textContent = String(reading.bpm);
});
```

✅ **Good:**
```typescript
let lastUpdate = 0;

analyzer.on('reading', (reading) => {
  const now = Date.now();

  if (now - lastUpdate > 1000) {
    bpmDisplay.textContent = String(reading.bpm);
    lastUpdate = now;
  }
});

// Always update when the analyzer locks
analyzer.on('statechange', ({ to }) => {
  if (to.status === 'locked') {
    bpmDisplay.textContent = String(to.reading.bpm);
  }
});
```

## Mobile Optimization

### Battery Life

On mobile devices, audio processing consumes battery. Optimize by:

1. **Render on state changes instead of every reading:**
```typescript
// Only render when the status changes, to reduce UI work
analyzer.on('statechange', ({ to }) => {
  if (to.status === 'locked') {
    bpmDisplay.textContent = String(to.reading.bpm);
  }
});
```

2. **Stop analysis when not needed:**
```typescript
// Pause analysis when app is backgrounded
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    audioContext.suspend();
  } else {
    audioContext.resume();
  }
});
```

3. **Bound memory on long sessions:**
```typescript
// Less history kept in memory
createRealtimeBpmAnalyzer(audioContext, {
  engine: { name: 'peaks', restartAfterSeconds: 15 },
});
```

### Mobile Safari Considerations

- **Requires user gesture** to start AudioContext
- **Suspends when backgrounded** (automatically handled)
- **Limited concurrent contexts** (typically 6)

Always create AudioContext in response to user action:

```typescript
const button = document.querySelector('button')!;

button.addEventListener('click', async () => {
  const audioContext = new AudioContext();
  await audioContext.resume(); // Important for iOS
  // ... rest of setup
});
```

## File Analysis Optimization

### Batch Processing

When analyzing multiple files, process sequentially to avoid memory issues:

✅ **Good:**
```typescript
async function analyzeFiles(files: File[]) {
  const results = [];

  for (const file of files) {
    const audioContext = new AudioContext();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const reading = await analyzeFullBuffer(audioBuffer);

    results.push({ file: file.name, bpm: reading?.bpm ?? null });
    
    // Clean up
    await audioContext.close();
  }
  
  return results;
}
```

### Large File Handling

For very large files (>10MB):

```typescript
async function analyzeLargeFile(file: File) {
  const audioContext = new AudioContext();
  
  try {
    // Read file in chunks if needed
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // Analyze
    const reading = await analyzeFullBuffer(audioBuffer);

    return reading?.bpm ?? null;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      // Handle memory limit
      throw new Error('File too large to analyze');
    }
    throw error;
  } finally {
    await audioContext.close();
  }
}
```

## Window Length Trade-offs {#accuracy-vs-speed-trade-offs}

In continuous analysis, `restartAfterSeconds` sets how much audio the
default engine keeps before it starts over.

### Shorter Window

```typescript
createRealtimeBpmAnalyzer(audioContext, {
  engine: { name: 'peaks', restartAfterSeconds: 10 }, // Starts over every 10 s
});
```

**Use when:**
- You want the reading to follow tempo changes sooner
- A rough BPM is enough

### Longer Window

```typescript
createRealtimeBpmAnalyzer(audioContext, {
  engine: { name: 'peaks', restartAfterSeconds: 30 }, // Keeps 30 s of audio before starting over
});
```

**Use when:**
- The tempo is steady and you want the reading to move less
- The music is busy (jazz, classical) and needs more audio to settle

## Monitoring Performance

### Track Memory Usage

<!-- typecheck: skip, performance.memory is Chrome only and not in TypeScript's DOM types -->
```typescript
if (performance.memory) {
  console.log('Heap size:', performance.memory.usedJSHeapSize);
  console.log('Heap limit:', performance.memory.totalJSHeapSize);
}
```

### Track CPU Usage

```typescript
// Use Performance API
const start = performance.now();

analyzer.on('statechange', ({ to }) => {
  if (to.status === 'locked') {
    const duration = performance.now() - start;
    console.log('Time to lock:', duration);
  }
});
```

### Network Monitoring (for streams)

```typescript
// Monitor stream buffering
audioElement.addEventListener('waiting', () => {
  console.warn('Stream buffering...');
});

audioElement.addEventListener('playing', () => {
  console.log('Stream resumed');
});
```

## Performance Checklist

- ✅ Connect the source to `analyzer.input`, which holds the low-pass filter
- ✅ Choose appropriate analysis mode
- ✅ Set a reasonable `restartAfterSeconds` for continuous analysis
- ✅ Clean up AudioContext and nodes when done
- ✅ Throttle UI updates to 1 update/second
- ✅ Render on `statechange` when possible
- ✅ Create AudioContext in response to user gesture (mobile)
- ✅ Process files sequentially, not in parallel
- ✅ Monitor memory on long-running applications
- ✅ Suspend AudioContext when app is backgrounded

## Next Steps

- [Browser Compatibility](/guide/browser-compatibility) - Platform support
- [How It Works](/guide/how-it-works) - Algorithm details
- [Examples](/examples/basic-usage) - Practical implementations
