# Performance Tips

Optimize Realtime BPM Analyzer for the best performance and accuracy in your application.

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

Always use the optional low-pass filter for better accuracy:

```typescript
import { createRealtimeBpmAnalyzer, getBiquadFilter } from 'realtime-bpm-analyzer';

const bpmAnalyzer = await createRealtimeBpmAnalyzer(audioContext);
const lowpass = getBiquadFilter(audioContext);

// Connect with filter
source.connect(lowpass).connect(bpmAnalyzer.node);
```

**Benefits:**
- 🎯 Better beat detection (isolates bass frequencies)
- ⚡ Faster processing (less data to analyze)
- 🎵 More accurate results (fewer false positives)

**Performance Impact:** Negligible (~0.1% CPU overhead)

### 3. Choose the Right Analysis Mode

Pick the mode that matches your use case:

| Use Case | Mode | Memory | CPU | Accuracy |
|----------|------|--------|-----|----------|
| Audio/Video Player | Real-time | Low | Low | High |
| Radio Stream | Continuous | Medium | Medium | Medium |
| File Upload | Offline | High | High | Highest |

#### Real-time Mode

```typescript
const analyzerNode = await createRealtimeBpmAnalyzer(audioContext);
```

- **Memory**: Grows with playback time
- **CPU**: Consistent low usage
- **Best for**: Songs with fixed length

#### Continuous Mode

```typescript
const analyzerNode = await createRealtimeBpmAnalyzer(audioContext, {
  continuousAnalysis: true,
  stabilizationTime: 20000 // Clear data every 20s
});
```

- **Memory**: Bounded by stabilizationTime
- **CPU**: Periodic spikes during cleanup
- **Best for**: Infinite streams, radio, live input

#### Offline Mode

```typescript
import { analyzeFullBuffer } from 'realtime-bpm-analyzer';

const bpm = await analyzeFullBuffer(audioBuffer);
```

- **Memory**: Entire file in memory
- **CPU**: One-time burst
- **Best for**: File analysis, batch processing

## Memory Management

### Continuous Analysis Settings

For long-running applications (streams, radio, microphone):

```typescript
createRealtimeBpmAnalyzer(audioContext, {
  continuousAnalysis: true,
  stabilizationTime: 20000, // Adjust based on needs
});
```

**Stabilization Time Guidelines:**

| Audio Type | Recommended Time | Reason |
|------------|------------------|--------|
| Electronic (EDM) | 15,000 ms | Simple, consistent beats |
| Pop/Rock | 20,000 ms | Standard complexity |
| Jazz/Complex | 30,000 ms | Variable rhythms |
| Classical | 40,000 ms | Tempo changes |

**Memory Impact:**
- Lower = Less memory, less accurate
- Higher = More memory, more accurate

### Clean Up Resources

Always clean up when done:

```typescript
// Stop analysis
await audioContext.suspend();

// Disconnect nodes
source.disconnect();
analyzerNode.disconnect();

// Close context if no longer needed
await audioContext.close();
```

## CPU Optimization

### 1. Avoid Redundant Analysis

Don't create multiple analyzers for the same source:

❌ **Bad:**
```typescript
// Creating analyzers in a loop
setInterval(() => {
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

Don't update the UI on every BPM event:

❌ **Bad:**
```typescript
analyzerNode.on('bpm', (data) => {
  // Updates too frequently!
  document.getElementById('bpm').textContent = data.bpm[0].tempo;
});
```

✅ **Good:**
```typescript
let lastUpdate = 0;

analyzerNode.on('bpm', (data) => {
  const now = Date.now();
  
  if (now - lastUpdate > 1000) {
    document.getElementById('bpm').textContent = data.bpm[0].tempo;
    lastUpdate = now;
  }
});

// Always update on stable BPM
analyzerNode.on('bpmStable', (data) => {
  document.getElementById('bpm').textContent = data.bpm[0].tempo;
});
```

## Mobile Optimization

### Battery Life

On mobile devices, audio processing consumes battery. Optimize by:

1. **Use `bpmStable` instead of continuous `bpm` updates:**
```typescript
// Only act on stable BPM to reduce processing
analyzerNode.on('bpmStable', (data) => {
  handleBPMUpdate(data.bpm);
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

3. **Use lower stabilization times:**
```typescript
// Faster results = less battery drain
createRealtimeBpmAnalyzer(audioContext, {
  continuousAnalysis: true,
  stabilizationTime: 15000 // Lower than default
});
```

### Mobile Safari Considerations

- **Requires user gesture** to start AudioContext
- **Suspends when backgrounded** (automatically handled)
- **Limited concurrent contexts** (typically 6)

Always create AudioContext in response to user action:

```typescript
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
async function analyzeFiles(files) {
  const results = [];
  
  for (const file of files) {
    const audioContext = new AudioContext();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const bpm = await analyzeFullBuffer(audioBuffer);
    
    results.push({ file: file.name, bpm });
    
    // Clean up
    await audioContext.close();
  }
  
  return results;
}
```

### Large File Handling

For very large files (>10MB):

```typescript
async function analyzeLargeFile(file) {
  const audioContext = new AudioContext();
  
  try {
    // Read file in chunks if needed
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // Analyze
    const bpm = await analyzeFullBuffer(audioBuffer);
    
    return bpm;
  } catch (error) {
    if (error.name === 'QuotaExceededError') {
      // Handle memory limit
      throw new Error('File too large to analyze');
    }
    throw error;
  } finally {
    await audioContext.close();
  }
}
```

## Accuracy vs Speed Trade-offs

### Fast Detection (Lower Accuracy)

```typescript
createRealtimeBpmAnalyzer(audioContext, {
  stabilizationTime: 10000 // Faster, less accurate
});
```

**Use when:**
- Speed is critical
- Approximate BPM is acceptable
- Real-time feedback needed

### High Accuracy (Slower Detection)

```typescript
createRealtimeBpmAnalyzer(audioContext, {
  stabilizationTime: 30000 // Slower, more accurate
});
```

**Use when:**
- Accuracy is critical
- BPM changes need detection
- Complex music (jazz, classical)

## Monitoring Performance

### Track Memory Usage

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

analyzerNode.on('bpmStable', (data) => {
  const duration = performance.now() - start;
  console.log('Time to BPM:', duration);
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

- ✅ Use `getBiquadFilter()` for better detection
- ✅ Choose appropriate analysis mode
- ✅ Set reasonable `stabilizationTime` for continuous analysis
- ✅ Clean up AudioContext and nodes when done
- ✅ Throttle UI updates to 1 update/second
- ✅ Use `bpmStable` events when possible
- ✅ Create AudioContext in response to user gesture (mobile)
- ✅ Process files sequentially, not in parallel
- ✅ Monitor memory on long-running applications
- ✅ Suspend AudioContext when app is backgrounded

## Benchmarks

Typical performance on modern devices:

| Device | Mode | CPU Usage | Memory | Time to Stable |
|--------|------|-----------|--------|----------------|
| Desktop (Chrome) | Real-time | <5% | ~10MB | 10-15s |
| Desktop (Chrome) | Continuous | <8% | ~15MB | 15-20s |
| Mobile (Safari) | Real-time | <15% | ~15MB | 15-20s |
| Mobile (Safari) | Continuous | <20% | ~20MB | 20-25s |

*Based on typical 128kbps MP3 files*

## Next Steps

- [Browser Compatibility](/guide/browser-compatibility) - Platform support
- [How It Works](/guide/how-it-works) - Algorithm details
- [Examples](/examples/basic-usage) - Practical implementations
