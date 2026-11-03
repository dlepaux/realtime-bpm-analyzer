---
title: 'Migration Guide: Upgrading from v5 to v6'
description: 'Migrate realtime-bpm-analyzer from 5.x to 6: the engine option, the reading and statechange events, the analyzer state, whole-buffer results and the removed exports, each with before-and-after code.'
---

# Migration Guide: v5 to v6

Version 6 replaces the 5.x events with one reading per analysis step and a state you can read at any time. This page lists every renamed or removed option and event, with the 5.x code and its v6 form.

As before, the library runs on the device and sends no audio anywhere.

## The analyzer state

v6 adds `analyzer.state`, a snapshot of what the analyzer is doing. Its `status` is one of `listening`, `settling`, `locked` and `stopped`. Each change of status dispatches a `statechange` event with `from`, `to` and a `reason`.

```typescript
analyzer.on('statechange', ({ from, to, reason }) => {
  console.log(`${from.status} to ${to.status} (${reason})`);
});

// A listener added late reads the current state: events are never replayed
console.log(analyzer.state.status);
```

## Options

### `detector` is now `engine`

**Before (5.x):**
```typescript
const analyzer = await createRealtimeBpmAnalyzer(audioContext, { detector: 'tempogram' });
const tempos = await analyzeFullBuffer(audioBuffer, { detector: 'tempogram' });
```

**After (v6):**
```typescript
const analyzer = await createRealtimeBpmAnalyzer(audioContext, { engine: 'tempogram' });
const reading = await analyzeFullBuffer(audioBuffer, { engine: 'tempogram' });
```

The default engine is `peaks`. To keep the engine you run today whatever a later default becomes, name it: `engine: 'peaks'`.

### `tempogramMode` moved into `engine`

**Before (5.x):**
```typescript
createRealtimeBpmAnalyzer(audioContext, { detector: 'tempogram', tempogramMode: 'extension' });
```

**After (v6):**
```typescript
createRealtimeBpmAnalyzer(audioContext, { engine: { name: 'tempogram', mode: 'extension' } });
```

### `continuousAnalysis` and `stabilizationTime` are now `restartAfterSeconds`

The time is now in seconds of audio, not milliseconds.

**Before (5.x):**
```typescript
createRealtimeBpmAnalyzer(audioContext, { continuousAnalysis: true, stabilizationTime: 20000 });
```

**After (v6):**
```typescript
createRealtimeBpmAnalyzer(audioContext, { engine: { name: 'peaks', restartAfterSeconds: 20 } });
```

Each restart outside `listening` is a `statechange` to `listening` with reason `tempo-changed`.

### `muteTimeInIndexes` is removed

It has no replacement. Remove it.

**Before (5.x):**
```typescript
createRealtimeBpmAnalyzer(audioContext, { muteTimeInIndexes: 10000 });
```

**After (v6):**
```typescript
createRealtimeBpmAnalyzer(audioContext);
```

### `frequencyValue` and `qualityValue` moved into `engine`

Only whole-buffer analysis takes a lowpass, because realtime callers place their own filter.

**Before (5.x):**
```typescript
analyzeFullBuffer(audioBuffer, { frequencyValue: 200, qualityValue: 1 });
```

**After (v6):**
```typescript
analyzeFullBuffer(audioBuffer, { engine: { name: 'peaks', lowpass: { frequency: 200, q: 1 } } });
```

### A removed option throws

v6 refuses every option above by its 5.x name with a `TypeError` that names the replacement, so a missed rename fails at once instead of being ignored.

## Events

### `bpm` is now `reading`

A reading carries one tempo, `bpm`, a whole number, and the ranked `candidates`.

**Before (5.x):**
```typescript
analyzer.on('bpm', (data) => {
  console.log(data.bpm[0].tempo);
});
```

**After (v6):**
```typescript
analyzer.on('reading', (reading) => {
  console.log(reading.bpm);
});
```

### `bpmStable` is now `statechange` to `locked`

**Before (5.x):**
```typescript
analyzer.on('bpmStable', (data) => {
  console.log('Stable:', data.bpm[0].tempo);
});
```

**After (v6):**
```typescript
analyzer.on('statechange', ({ to }) => {
  if (to.status === 'locked') {
    console.log('Locked:', to.reading.bpm);
  }
});
```

While locked, the tempo can still move without a `statechange`, so keep showing the latest `reading`.

### `analyzerReset` is now `statechange` to `listening`

The reason says why the analyzer started over: `audio-lost`, `tempo-changed` or `pulse-lost`.

**Before (5.x):**
```typescript
analyzer.on('analyzerReset', () => {
  showWaiting();
});
```

**After (v6):**
```typescript
analyzer.on('statechange', ({ to }) => {
  if (to.status === 'listening') {
    showWaiting(to.reason);
  }
});
```

### `progress` carries a fraction

**Before (5.x):**
```typescript
analyzer.on('progress', ({ peaks, requiredPeaks }) => {
  bar.value = peaks / requiredPeaks;
});
```

**After (v6):**
```typescript
analyzer.on('progress', ({ fraction }) => {
  bar.value = fraction;
});
```

While listening, `analyzer.state.progress` holds the same value.

### `error` carries a name

The payload is plain data, with no `Error` object inside. A fatal fault also moves the analyzer to `stopped`, with the error in `state.error`.

**Before (5.x):**
```typescript
analyzer.on('error', ({ message, error }) => {
  console.error(message, error);
});
```

**After (v6):**
```typescript
analyzer.on('error', ({ name, message }) => {
  console.error(name, message);
});
```

### `analyzeChunk` and `validPeak` are now `debug`

With `debug: true`, every engine sends `debug` events. Their `data` has no stable shape.

**Before (5.x):**
```typescript
analyzer.on('analyzeChunk', (data) => console.log(data));
analyzer.on('validPeak', (data) => console.log(data));
```

**After (v6):**
```typescript
analyzer.on('debug', ({ engine, data }) => console.log(engine, data));
```

## Listeners

### `once()` is now an option of `on()`

**Before (5.x):**
```typescript
analyzer.once('bpmStable', handler);
```

**After (v6):**
```typescript
analyzer.on('statechange', handler, { once: true });
```

### `on()` returns its unsubscribe function, and `off()` is back

**Before (5.x):**
```typescript
analyzer.on('bpm', handler);
analyzer.removeEventListener('bpm', handler);
```

**After (v6):**
```typescript
const unsubscribe = analyzer.on('reading', handler);
unsubscribe();

// or
analyzer.on('reading', handler);
analyzer.off('reading', handler);
```

`on()` also takes a `signal`, which removes the listener when it aborts.

## `reset()` and `stop()`

`reset()` now reports itself: a `statechange` with reason `reset`, then `progress` with fraction 0. Once `reset()` returns, nothing measured before it is ever reported.

`stop()` is final. It moves the analyzer to `stopped`, and the analyzer cannot start again. Create a new one instead.

**Before (5.x):**
```typescript
analyzer.stop();
// later
analyzer.reset();
```

**After (v6):**
```typescript
analyzer.stop();
// later
analyzer = await createRealtimeBpmAnalyzer(audioContext);
```

## Whole-buffer results

`analyzeFullBuffer` and the Node `analyzeChannelData` return one reading, or `null` when they find no tempo.

**Before (5.x):**
```typescript
const tempos = await analyzeFullBuffer(audioBuffer);
if (tempos.length > 0) {
  console.log(tempos[0].tempo, tempos[0].count);
}
```

**After (v6):**
```typescript
const reading = await analyzeFullBuffer(audioBuffer);
if (reading !== null) {
  console.log(reading.bpm, reading.candidates);
}
```

`Tempo.count` is removed. `BpmCandidates`, its `threshold`, `Threshold` and `Peaks` are removed too.

## Removed exports

`RealTimeBpmAnalyzer` and `createRealTimeBpmProcessor` are removed. Use `createRealtimeBpmAnalyzer`.

**Before (5.x):**
```typescript
import { createRealTimeBpmProcessor } from 'realtime-bpm-analyzer';
const analyzer = await createRealTimeBpmProcessor(audioContext);
```

**After (v6):**
```typescript
import { createRealtimeBpmAnalyzer } from 'realtime-bpm-analyzer';
const analyzer = await createRealtimeBpmAnalyzer(audioContext);
```

## New in a reading

- `candidates`: each has a `bpm` and a `relation` to the reading's tempo: `top`, `half`, `double` or `other`.
- `bpmExact`: the tempo before rounding, for placing beats over a long stretch. Show `bpm`.
- `audio`: the stretch the reading was measured on, `from` and `to` in seconds since the analyzer started or was reset. Realtime, `contextTime` is the `AudioContext.currentTime` at which the sample at `to` reached the analyzer. Whole-buffer readings have `contextTime: null`.
- `engine`: the engine that measured it.

```typescript
analyzer.on('reading', ({ bpmExact, audio }) => {
  if (audio.contextTime !== null) {
    const beat = 60 / bpmExact;
    scheduleGrid(audio.contextTime, beat);
  }
});
```

## Unions may grow

A minor release of 6.x can add a value to an exported union: an engine name, a candidate relation, a reason, an error name or an event. Give every `switch` over one a `default` branch, so a new value does not break it. `status` is the one closed union.

```typescript
analyzer.on('statechange', ({ reason }) => {
  switch (reason) {
    case 'locked':
      showLocked();
      break;
    case 'pulse-lost':
      showWaiting();
      break;
    default:
      break;
  }
});
```

## Processor file

If you serve the processor file yourself through `processorUrl`, copy the v6 file again. A 5.x file does not speak to a v6 analyzer, and `createRealtimeBpmAnalyzer` rejects when it sends no `ready` in time.
