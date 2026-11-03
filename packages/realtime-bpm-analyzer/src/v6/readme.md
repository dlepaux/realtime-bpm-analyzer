# v6 reporting contract

This folder holds the contract for what realtime-bpm-analyzer 6.x reports. It covers the public types
(`types.ts`), and the transition table plus the pure reducer that enforces it (`transitions.ts`). Nothing
imports this folder yet, so the 5.x bundles, declarations and API docs are unchanged. Phase 3 of RBA-108
wires it into the analyzer and removes the 5.x surface. The plan is `plan/rba-v6-reporting.md` in the
workspace.

This note sits beside the code rather than in `docs/`, because VitePress would publish it as a page for an
API that hasn't shipped yet. The migration guide (phase 6) moves the mapping table below into `docs/`.

## Why state and events are split

5.x reports through events alone. `bpm` and `bpmStable` carry the same payload, so "stable" is an event,
not a state. A lost lock has no event at all, and a listener added late can't learn what it missed. Each
app rebuilds the state machine from the events, and rba-pro is one example (its `reading.ts`).

v6 follows `AudioContext`, the pattern web developers already know. `AudioContext.state` is a value you can
query, and `statechange` announces each change to it. Here:

- `analyzer.state` is a snapshot of what the analyzer is doing: `listening`, `settling`, `locked` or
  `stopped`. It's a sum type, so each status carries only the fields that mean something in it: progress
  while listening, the reading while settling or locked, the error once stopped.
- Events announce changes and measurements. `statechange` fires on transitions, `reading` and `progress`
  on analysis steps, and `error` on non-fatal faults. `reading` is a measurement and never stands in for a
  state.

Splitting them this way gives three guarantees, and the tests check each one:

1. **One source, one order.** The worklet sends one message per analysis step. The reducer turns it into
   the next state and an ordered list of events. The state is stored first, then `statechange`
   dispatches, then `reading` or `progress`. Inside any listener, `state` is already current.
2. **Late subscribers aren't stuck.** Events are never replayed, and a listener added late reads `state`.
3. **No in-flight race.** `reset()` moves to the next epoch synchronously. The worklet stamps every
   message with the epoch it was measured in, and the reducer drops older ones. Once `reset()` returns,
   nothing measured before it is reported. If a listener calls `reset()` or `stop()`, the rest of that
   step's events are dropped too. The only exception is a fatal fault, which stops the analyzer whatever
   its epoch, because the processor that sent it is gone.

Two smaller choices sit alongside these:

- Every message carries a protocol version. A stale processor (an old `processorUrl` copy, or a 5.x file
  copied into an extension build) fails loudly with `ProtocolMismatch` instead of misbehaving.
- The table refuses an illegal transition: the message is dropped and an `error` is reported. The engine
  never decides on its own what a status means.

Hysteresis belongs to the engine. Locking and unlocking use different bands and dwell times (`Hysteresis`),
so the state can't flap, and the reducer enforces only the table. The values are placeholders until phase 3
measures them on the benchmark.

## Transition table

| From | To | Reason | Source |
|---|---|---|---|
| listening | settling | `first-reading` | engine |
| settling | locked | `locked` | engine |
| locked | settling | `unlocked` | engine |
| settling, locked | listening | `pulse-lost`, `audio-lost`, `tempo-changed` | engine |
| listening, settling, locked | listening (next epoch) | `reset` | caller |
| listening, settling, locked | stopped | `stopped` | caller |
| listening, settling, locked | stopped | `failed` | fault |

Nothing leaves `stopped`. Once stopped, `reset()` throws `InvalidStateError`, as `AudioContext` methods do
after `close()`, while a second `stop()` does nothing, so teardown code can call it freely.

## 5.x to v6 mapping

The migration guide builds on this table.

| 5.x | v6 |
|---|---|
| option `detector` | `engine` |
| `tempogramMode: 'extension'` | `engine: {name: 'tempogram', mode: 'extension'}` |
| `continuousAnalysis` + `stabilizationTime` (ms) | `engine: {name: 'peaks', restartAfterSeconds}` |
| `muteTimeInIndexes` | removed (engine detail) |
| `analyzeFullBuffer` lowpass `frequencyValue`, `qualityValue` | `engine: {name: 'peaks', lowpass: {frequency, q}}` |
| event `bpm` | `reading` |
| event `bpmStable` | `statechange` with `to.status === 'locked'` |
| event `analyzerReset` | `statechange` to `listening`, reason `audio-lost` or `tempo-changed` |
| `reset()`, silent | `statechange` with reason `reset`, then `progress` 0, and the epoch moves |
| `stop()`, silent, said to be restartable | final: `statechange` to `stopped` |
| event `progress {peaks, requiredPeaks}` | `progress {fraction}`, also `state.progress` |
| event `error {message, error}` | `error {name, message}`, serialisable. Fatal faults become `stopped` / `failed` |
| debug events `analyzeChunk`, `validPeak` | `debug {engine, data}`, no stable shape |
| `on()` returns nothing | returns its unsubscribe function, and `off()` exists |
| `once()` | `on(type, listener, {once: true})` |
| `Tempo.tempo` | `Reading.bpm`, `Candidate.bpm` |
| `Tempo.count` | removed |
| `Tempo.confidence` (per engine) | `Reading.confidence`, calibrated (RBA-106) or removed |
| `BpmCandidates.threshold`, `Threshold`, `Peaks` | removed |
| (none) | `Candidate.relation`: `top`, `half`, `double`, `other` |
| (none) | `Reading.audio {from, to}`, in seconds since the epoch began |
| `analyzeFullBuffer` / `analyzeChannelData` return `Tempo[]` | `Reading \| null` |
| `RealTimeBpmAnalyzer`, `createRealTimeBpmProcessor` | removed |
| `ProcessorInputEvent`, `ProcessorOutputEvent` | internal `HostMessage`, `WorkletMessage`, versioned |
