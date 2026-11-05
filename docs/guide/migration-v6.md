---
title: 'Migration Guide: Upgrading from v5 to v6'
description: 'Migrate realtime-bpm-analyzer from 5.x to 6 in two steps: the renamed events, options and fields, mapped one to one with before-and-after code, then the new default engine and the one-line way back to peaks.'
---

# Migration Guide: v5 to v6

Version 6 makes two changes, and this page keeps them apart, so an app that breaks on the upgrade can tell which one broke it:

1. **[Renames](#part-1-events-options-and-fields).** The 5.x events become one reading per analysis step and a state you can read at any time, and the options and fields get engine-neutral names. A missed rename fails loudly: TypeScript stops compiling, and a removed option throws.
2. **[The default engine](#part-2-the-default-engine).** The `tempogram` engine replaces `peaks` as the default. Nothing fails: the tempo comes from another engine, with its own timing. `engine: 'peaks'` is the one-line way back.

Do part 1 first, with `engine: 'peaks'` set, and check your app. Then remove that line to move to the new default.

As before, the library runs on the device, sends no audio anywhere and collects nothing.

## Part 1: events, options and fields

Every 5.x name and its v6 form. The sections below show each with before-and-after code.

| 5.x | v6 |
| --- | --- |
| option `detector` | `engine` |
| `tempogramMode: 'extension'` | `engine: { name: 'tempogram', mode: 'extension' }` |
| `continuousAnalysis` and `stabilizationTime` (ms) | `engine: { name: 'peaks', restartAfterSeconds }` (seconds) |
| `muteTimeInIndexes` | removed |
| `analyzeFullBuffer` and Node's `analyzeChannelData` options `frequencyValue`, `qualityValue` | `engine: { name: 'peaks', lowpass: { frequency, q } }` |
| event `bpm` | `reading` |
| event `bpmStable` | `statechange` with `to.status === 'locked'` |
| event `analyzerReset` | `statechange` to `listening`, reason `audio-lost`, `tempo-changed` or `pulse-lost` |
| event `progress` `{ peaks, requiredPeaks }` | `progress` `{ fraction }`, also `analyzer.state.progress` |
| event `error` `{ message, error }` | `error` `{ name, message }`; a fatal fault moves to `stopped` instead |
| debug events `analyzeChunk`, `validPeak` | `debug` `{ engine, data }`, with no stable shape |
| `once(type, listener)` | `on(type, listener, { once: true })` |
| `on()` returns nothing | `on()` returns its unsubscribe function, and `off()` is new |
| `reset()`, silent | `statechange` with reason `reset`, then `progress` 0 |
| `stop()`, said to be restartable | final: `statechange` to `stopped` |
| `Tempo.tempo` | `Reading.bpm`, and `Candidate.bpm` for the other tempos |
| `Tempo.count` | removed |
| `Tempo.confidence` | `Reading.confidence`, uncalibrated for now |
| `BpmCandidates.threshold`, `Threshold`, `Peaks` | removed |
| `analyzeFullBuffer` and Node's `analyzeChannelData` return `Tempo[]` | return a `Reading`, or `null` when no tempo was found |
| `createRealTimeBpmProcessor` | removed: use `createRealtimeBpmAnalyzer` |
| `new BpmAnalyzer(node)` | private: use `createRealtimeBpmAnalyzer` |
| `RealTimeBpmAnalyzer` (the worklet-side analyzer, deprecated in 5.x) | removed, no replacement |

<!-- RBA-106: calibration gives confidence its meaning, or removes it. Update the Tempo.confidence row then. -->

New, with no 5.x counterpart: `analyzer.state`, `Reading.bpmExact`, `Reading.audio`, `Reading.engine` and `Candidate.relation`. They are described [at the end of part 1](#new-in-a-reading).


### The analyzer state

v6 adds `analyzer.state`, a snapshot of what the analyzer is doing. Its `status` is one of `listening`, `settling`, `locked` and `stopped`. Each change of status dispatches a `statechange` event with `from`, `to` and a `reason`.

```typescript
analyzer.on('statechange', ({ from, to, reason }) => {
  console.log(`${from.status} to ${to.status} (${reason})`);
});

// A listener added late reads the current state: events are never replayed
console.log(analyzer.state.status);
```

### Options

#### `detector` is now `engine`

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

The default engine changed too: see [part 2](#part-2-the-default-engine).

#### `tempogramMode` moved into `engine`

**Before (5.x):**
```typescript
createRealtimeBpmAnalyzer(audioContext, { detector: 'tempogram', tempogramMode: 'extension' });
```

**After (v6):**
```typescript
createRealtimeBpmAnalyzer(audioContext, { engine: { name: 'tempogram', mode: 'extension' } });
```

#### `continuousAnalysis` and `stabilizationTime` are now `restartAfterSeconds`

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

#### `muteTimeInIndexes` is removed

It has no replacement. Remove it.

**Before (5.x):**
```typescript
createRealtimeBpmAnalyzer(audioContext, { muteTimeInIndexes: 10000 });
```

**After (v6):**
```typescript
createRealtimeBpmAnalyzer(audioContext);
```

#### `frequencyValue` and `qualityValue` moved into `engine`

Only whole-buffer analysis takes lowpass settings. Realtime `peaks` already has a fixed lowpass inside `analyzer.input`, so connect your source there and add no filter of your own.

**Before (5.x):**
```typescript
analyzeFullBuffer(audioBuffer, { frequencyValue: 200, qualityValue: 1 });
```

**After (v6):**
```typescript
analyzeFullBuffer(audioBuffer, { engine: { name: 'peaks', lowpass: { frequency: 200, q: 1 } } });
```

#### A removed option throws

v6 refuses every option above by its 5.x name with a `TypeError` that names the replacement, so a missed rename fails at once instead of being ignored.

### Events

#### `bpm` is now `reading`

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

#### `bpmStable` is now `statechange` to `locked`

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

#### `analyzerReset` is now `statechange` to `listening`

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

#### `progress` carries a fraction

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

#### `error` carries a name

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

#### `analyzeChunk` and `validPeak` are now `debug`

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

### Listeners

#### `once()` is now an option of `on()`

**Before (5.x):**
```typescript
analyzer.once('bpmStable', handler);
```

**After (v6):**
```typescript
analyzer.on('statechange', handler, { once: true });
```

#### `on()` returns its unsubscribe function, and `off()` is new

**Before (5.x):**
```typescript
analyzer.on('bpm', handler);
analyzer.removeEventListener('bpm', handler);
```

That 5.x sample never removed anything: `on()` registered a wrapper around `handler`, so `removeEventListener` with `handler` found no match. In v6 both ways below remove the listener.

**After (v6):**
```typescript
const unsubscribe = analyzer.on('reading', handler);
unsubscribe();

// or
analyzer.on('reading', handler);
analyzer.off('reading', handler);
```

`on()` also takes a `signal`, which removes the listener when it aborts.

### `reset()` and `stop()`

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

### Whole-buffer results

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

### Removed exports

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

#### Removed types

TypeScript code that imports one of these no longer compiles. Each 5.x type and what to use in v6:

| 5.x type | v6 |
| --- | --- |
| `Tempo` | `Candidate` for one tempo of a reading, `Reading` for the reading itself |
| `BpmCandidates` | `Reading`: its `candidates` are a `Candidate[]` |
| `BpmProgress` | `Progress` |
| `BpmAnalyzerEventMap` | `AnalyzerEventMap` |
| `CreateRealtimeBpmAnalyzerOptions` | `AnalyzerOptions` |
| `RealTimeBpmAnalyzerParameters` | `AnalyzerOptions` |
| `AnalyzeFullBufferOptions` | `OfflineOptions` |
| `Detector` | `EngineName` |
| `TempogramMode` | `EngineOption`: `{ name: 'tempogram', mode: 'extension' }` |
| `Threshold` | None: the peaks engine's threshold is internal. `debug: true` shows it in `DebugInfo` |
| `Peaks` | None: internal to the peaks engine. `debug: true` shows the peaks in `DebugInfo` |
| `ProcessorInputEvent` | None: the worklet's messages are internal |
| `ProcessorOutputEvent` | None: read `AnalyzerEventMap` instead |

### New in a reading

- `candidates`: each has a `bpm` and a `relation` to the reading's tempo: `top`, `half`, `double` or `other`.
- `bpmExact`: the tempo before rounding, for spacing markers over a long stretch once you know where one beat falls. Show `bpm`.
- `audio`: the stretch the reading was measured on, `from` and `to` in seconds since the analyzer started or was reset. Realtime, `contextTime` is the `AudioContext.currentTime` at which the sample at `to` reached the analyzer. Whole-buffer readings have `contextTime: null`.
- `engine`: the engine that measured it.

A reading has a tempo, not a beat phase: nothing in it says where a beat falls, so don't start a beat grid at `contextTime`. Beat positions are planned for a later 6.x minor. What `contextTime` gives you is the mapping of analysed audio onto the clock `AudioContext` schedules on: a moment `t` of the stretch played at `contextTime - (audio.to - t)`.

```typescript
analyzer.on('reading', ({ bpm, audio }) => {
  if (audio.contextTime !== null) {
    // When the measured stretch played, on the AudioContext clock
    const startedAt = audio.contextTime - (audio.to - audio.from);
    highlightMeasured(startedAt, audio.contextTime, bpm);
  }
});
```

### Unions may grow

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

### Processor file

If you serve the processor file yourself through `processorUrl`, copy the v6 file again. A 5.x file does not speak to a v6 analyzer, and `createRealtimeBpmAnalyzer` rejects when it sends no `ready` in time. Within 6.x, a copy one minor behind still works, and a feature it lacks throws an error saying the processor copy is out of date. Copy the file again on every upgrade to get every feature.

## Part 2: the default engine

v6 makes the `tempogram` engine the default, in realtime and for whole files. It reads the tempo from an onset tempogram, spectral flux across several bands, where `peaks` reads amplitude peaks in low-passed audio. Both report the same reading, so no code has to change, but what your app sees does:

- **Wiring.** `analyzer.input` holds no filter for the tempogram, which needs the full band. Connect your source to `analyzer.input` as before. If you put `getBiquadFilter()` or a low-pass of your own in front of the analyzer for `peaks`, remove it.
- **Timing.** The first reading comes after a 4-second warm-up, and the earliest lock after about 11.5 seconds of audio, where `peaks` gives its first reading once it has 16 peaks (about 8 seconds on a steady kick) and locks from 10 seconds. Readings come twice a second instead of about ten times.
- **Tempo range.** The tempogram searches `tempoRange` instead of folding every tempo into it. From about twice `min` up, a tempo can read at half: with the default 90 to 180, a track over about 179 BPM reads half. A wider range does not fix that. See [the tempogram engine](/guide/realtime-bpm-detection#the-tempogram-detector).
- **Restarts.** `restartAfterSeconds` is a `peaks` setting. The tempogram's memory of past tempos fades with a 16-second half-life, so it follows a tempo change on its own.
- **Confidence.** Each engine scores it its own way, so a value you compared under `peaks` means something else under the tempogram.
- **Locks.** On some tracks the tempogram never locks where `peaks` did. Keep showing the latest `reading` while the analyzer is `settling`.

<!-- RBA-106: calibration gives confidence its meaning, or removes it. Update the confidence bullet then. -->

### The way back: `engine: 'peaks'`

One line keeps the 5.x engine:

```typescript
const analyzer = await createRealtimeBpmAnalyzer(audioContext, { engine: 'peaks' });
const reading = await analyzeFullBuffer(audioBuffer, { engine: 'peaks' });
```

The command-line tool takes `--engine peaks`, and the MCP server's tools take `engine: "peaks"`.

Setting `engine` also keeps your engine whatever a later default becomes, so name it if your app depends on one engine's timing or range.
