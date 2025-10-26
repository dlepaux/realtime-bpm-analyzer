# Migration Guide: v3.x to v4.0

This guide will help you migrate from version 3.x to 4.0, which introduces a new typed event system with improved developer experience.

## What's New

Version 4.0 introduces:

- ✨ **Typed Event Emitter**: Replace `port.onmessage` with typed `.on()` listeners
- 🎯 **Full TypeScript autocomplete**: Get suggestions for event names and data structures
- 🧹 **Cleaner API**: No more nested `.data.data` or manual string comparisons
- 🔧 **Better event names**: `bpm`, `bpmStable` instead of `'BPM'`, `'BPM_STABLE'`
- 🐛 **Fixed typo**: `analyzerReset` instead of `'ANALYZER_RESETED'`

## Breaking Changes

### 1. Return Type Changed

`createRealTimeBpmProcessor()` now returns a `BpmAnalyzer` instance instead of `AudioWorkletNode`.

**Before (v3.x):**
```typescript
const analyzer: AudioWorkletNode = await createRealTimeBpmProcessor(audioContext);
```

**After (v4.0):**
```typescript
const analyzer: BpmAnalyzer = await createRealTimeBpmProcessor(audioContext);
```

### 2. Event Listening API

The biggest change is how you listen to events.

**Before (v3.x):**
```typescript
analyzer.port.onmessage = (event) => {
  if (event.data.message === 'BPM') {
    console.log(event.data.data.bpm[0].tempo);
  }
  
  if (event.data.message === 'BPM_STABLE') {
    console.log(event.data.data.bpm[0].tempo);
  }
};
```

**After (v4.0):**
```typescript
analyzer.on('bpm', (data) => {
  console.log(data.bpm[0].tempo);
});

analyzer.on('bpmStable', (data) => {
  console.log(data.bpm[0].tempo);
});
```

### 3. Event Names

Event names have changed from SCREAMING_SNAKE_CASE to camelCase.

| Old (v3.x) | New (v4.0) |
|------------|------------|
| `'BPM'` | `'bpm'` |
| `'BPM_STABLE'` | `'bpmStable'` |
| `'ANALYZER_RESETED'` | `'analyzerReset'` |
| `'ANALYZE_CHUNK'` | `'analyzeChunk'` (debug mode) |
| `'VALID_PEAK'` | `'validPeak'` (debug mode) |

### 4. Event Data Structure

No more nested `.data.data` structure.

**Before (v3.x):**
```typescript
event.data.message === 'BPM'
event.data.data.bpm       // ← nested .data.data
event.data.data.threshold
```

**After (v4.0):**
```typescript
data.bpm        // ← direct access
data.threshold
```

## Migration Examples

### Basic Audio Element

**Before (v3.x):**
```typescript
const audioContext = new AudioContext();
const analyzer = await createRealTimeBpmProcessor(audioContext);
const source = audioContext.createMediaElementSource(audioElement);

source.connect(analyzer).connect(audioContext.destination);

analyzer.port.onmessage = (event) => {
  const { message, data } = event.data;
  
  if (message === 'BPM') {
    console.log('Current:', data.bpm[0].tempo);
  }
  
  if (message === 'BPM_STABLE') {
    console.log('Stable:', data.bpm[0].tempo);
  }
};
```

**After (v4.0):**
```typescript
const audioContext = new AudioContext();
const analyzer = await createRealTimeBpmProcessor(audioContext);
const source = audioContext.createMediaElementSource(audioElement);

source.connect(analyzer).connect(audioContext.destination);

analyzer.on('bpm', (data) => {
  console.log('Current:', data.bpm[0].tempo);
});

analyzer.on('bpmStable', (data) => {
  console.log('Stable:', data.bpm[0].tempo);
});
```

### React Hook

**Before (v3.x):**
```typescript
useEffect(() => {
  const analyzer = analyzerRef.current;
  if (!analyzer) return;
  
  analyzer.port.onmessage = (event) => {
    if (event.data.message === 'BPM_STABLE') {
      setBpm(event.data.data.bpm[0]?.tempo || 0);
    }
  };
}, []);
```

**After (v4.0):**
```typescript
useEffect(() => {
  const analyzer = analyzerRef.current;
  if (!analyzer) return;
  
  analyzer.on('bpmStable', (data) => {
    setBpm(data.bpm[0]?.tempo || 0);
  });
  
  return () => {
    analyzer.removeAllListeners();
  };
}, []);
```

### Vue Composition API

**Before (v3.x):**
```typescript
const setupAnalyzer = async () => {
  const analyzer = await createRealTimeBpmProcessor(audioContext);
  
  analyzer.port.onmessage = (event) => {
    if (event.data.message === 'BPM_STABLE') {
      bpm.value = event.data.data.bpm[0]?.tempo || 0;
    }
  };
};
```

**After (v4.0):**
```typescript
const setupAnalyzer = async () => {
  const analyzer = await createRealTimeBpmProcessor(audioContext);
  
  analyzer.on('bpmStable', (data) => {
    bpm.value = data.bpm[0]?.tempo || 0;
  });
};
```

## New Features

### One-time Listeners

```typescript
// This listener will automatically be removed after firing once
analyzer.once('bpmStable', (data) => {
  console.log('First stable BPM:', data.bpm[0].tempo);
});
```

### Remove Listeners

```typescript
const handler = (data) => console.log(data);

// Add listener
analyzer.on('bpm', handler);

// Remove specific listener
analyzer.off('bpm', handler);

// Remove all listeners for an event
analyzer.removeAllListeners('bpm');

// Remove all listeners for all events
analyzer.removeAllListeners();
```

### Control Methods

```typescript
// Reset the analyzer (previously required sending messages)
analyzer.reset();

// Stop the analyzer
analyzer.stop();

// Listen for reset events
analyzer.on('analyzerReset', () => {
  console.log('Analyzer was reset');
});
```

### Access to Underlying Node

If you need direct access to the AudioWorkletNode:

```typescript
const analyzer = await createRealTimeBpmProcessor(audioContext);

// Access the underlying node
const workletNode: AudioWorkletNode = analyzer.node;

// But prefer using the BpmAnalyzer API
analyzer.connect(destination);
analyzer.disconnect();
```

## Type Definitions

### Event Map

All events are now strongly typed:

```typescript
type BpmAnalyzerEventMap = {
  bpm: BpmCandidates;
  bpmStable: BpmCandidates;
  analyzerReset: void;
  analyzeChunk: Float32Array;  // debug mode only
  validPeak: {threshold: number; index: number};  // debug mode only
};
```

### BpmCandidates

No changes to the data structure:

```typescript
type BpmCandidates = {
  bpm: Tempo[];
  threshold: number;
};

type Tempo = {
  tempo: number;
  count: number;
  confidence: number;
};
```

## Codemods / Find & Replace

Here are some regex patterns to help with migration:

### Replace event listeners

Find:
```regex
\.port\.onmessage\s*=\s*\(event\)\s*=>\s*\{
```

Replace with manual conversion to `.on()` syntax.

### Replace event checks

Find:
```regex
if\s*\(event\.data\.message\s*===\s*'BPM'\)
```

Replace:
```typescript
analyzer.on('bpm', (data) => {
```

Find:
```regex
if\s*\(event\.data\.message\s*===\s*'BPM_STABLE'\)
```

Replace:
```typescript
analyzer.on('bpmStable', (data) => {
```

### Replace data access

Find:
```regex
event\.data\.data\.
```

Replace:
```
data.
```

## Troubleshooting

### TypeScript errors about AudioWorkletNode

If you have code that explicitly types the analyzer as `AudioWorkletNode`:

```typescript
// ❌ Will cause errors
const analyzer: AudioWorkletNode = await createRealTimeBpmProcessor(audioContext);

// ✅ Use the correct type
const analyzer: BpmAnalyzer = await createRealTimeBpmProcessor(audioContext);

// Or let TypeScript infer
const analyzer = await createRealTimeBpmProcessor(audioContext);
```

### No autocomplete for event names

Make sure you're importing the types:

```typescript
import { createRealTimeBpmProcessor, type BpmAnalyzer } from 'realtime-bpm-analyzer';
```

### Event listeners not firing

Make sure you removed any `port.start()` calls - they're no longer needed:

```typescript
// ❌ Old way
analyzer.port.addEventListener('message', handler);
analyzer.port.start();  // Not needed anymore

// ✅ New way
analyzer.on('bpm', handler);
```

## Getting Help

If you encounter issues during migration:

1. Check the [examples](../examples/basic-usage.md) for reference implementations
2. Review the [API documentation](../api/)
3. Open an issue on [GitHub](https://github.com/dlepaux/realtime-bpm-analyzer/issues)

## Backward Compatibility

If you need to maintain compatibility with both v3 and v4, you can access the underlying node:

```typescript
const analyzer = await createRealTimeBpmProcessor(audioContext);

// Use new API
analyzer.on('bpm', handler);

// Or access old API through .node
analyzer.node.port.onmessage = legacyHandler;
```

However, we recommend fully migrating to the new API for the best developer experience.
