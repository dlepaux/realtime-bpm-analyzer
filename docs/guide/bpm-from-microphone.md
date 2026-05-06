---
title: How to Detect BPM from a Microphone in JavaScript
description: A complete guide to real-time BPM detection from microphone input using the Web Audio API and AudioWorklet — permissions, feedback loops, mobile gotchas, and a working pattern.
head:
  - - meta
    - name: keywords
      content: bpm from microphone javascript, microphone bpm detection, web audio api microphone, getUserMedia bpm, javascript live bpm, realtime bpm microphone
---

# How to Detect BPM from a Microphone in JavaScript

Reading BPM from a microphone is the hardest of the three input modes —
file, stream, mic — because the signal is dirty. Room reverb, ambient
noise, the user's keyboard clacking, the laptop fan. None of which were
problems when the audio came from an MP3.

It is also the most useful mode. A live performance tool, a music game, a
fitness trainer that picks up the user's footfalls, a "what's playing in
this café" detector, an accessibility tool that responds to ambient
music — all of these need the microphone. Files don't help; streams
don't help; only `getUserMedia` does.

This guide is the working pattern. It uses
`realtime-bpm-analyzer` and the AudioWorklet API to keep analysis off the
main thread, handles the permission and HTTPS gotchas, and avoids the two
classic traps (feedback loop, leaked tracks) that make first attempts
fail.

## What you'll get

A web page that:

- Asks the user for microphone permission via `getUserMedia`.
- Routes the microphone signal through a low-pass filter into a BPM
  analyzer running on the audio thread.
- Emits a stable BPM value once detection settles (typically 5–15
  seconds of audible rhythmic content).
- Releases the microphone cleanly when the user stops.

It does **not** play the microphone back through the speakers — that
would create a feedback loop. The audio is captured, analysed, and
discarded.

## Prerequisites

Three constraints are non-negotiable:

1. **HTTPS or localhost.** The `getUserMedia` API only works on secure
   origins. Local development on `http://localhost` works; staging on
   `http://192.168.1.10` does not. Plan around this from day one.
2. **A user gesture.** Both the microphone permission prompt and the
   `AudioContext` resume must happen inside a click, touch, or
   keypress handler. Browsers silently refuse otherwise. The "Start
   listening" button is mandatory.
3. **AudioWorklet support.** Any browser shipped after early 2021 will
   work — Chrome 66+, Firefox 76+, Safari 14.1+, Edge 79+. iOS Safari
   under 14.5 has known issues; gracefully degrade or warn.

## Installation

```bash
npm install realtime-bpm-analyzer
```

## The complete pattern

```typescript
import { createRealtimeBpmAnalyzer, getBiquadFilter, BpmAnalyzer } from 'realtime-bpm-analyzer';

let audioContext: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
let bpmAnalyzer: BpmAnalyzer | null = null;

async function startListening(onBpm: (bpm: number) => void) {
  // 1. Build the audio context inside the user gesture.
  audioContext = new AudioContext();
  await audioContext.resume();

  // 2. Ask for microphone access. Disable noise suppression and echo
  //    cancellation — they're tuned for voice and will eat the
  //    rhythmic transients we want to detect.
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  // 3. Build the audio graph: mic -> lowpass -> analyzer.
  const source = audioContext.createMediaStreamSource(mediaStream);
  const lowpass = getBiquadFilter(audioContext);
  bpmAnalyzer = await createRealtimeBpmAnalyzer(audioContext);

  source.connect(lowpass).connect(bpmAnalyzer.node);
  // Note: do NOT connect to audioContext.destination. Feedback loop.

  // 4. Surface stable detections to the application.
  bpmAnalyzer.on('bpmStable', ({ bpm }) => {
    if (bpm.length > 0) {
      onBpm(bpm[0].tempo);
    }
  });
}

async function stopListening() {
  bpmAnalyzer?.disconnect();
  bpmAnalyzer = null;

  // Stop every track on the MediaStream — without this the browser
  // keeps the microphone open and the recording indicator on.
  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaStream = null;

  await audioContext?.close();
  audioContext = null;
}

// Wire up to the UI.
document.getElementById('start')?.addEventListener('click', () => {
  startListening((bpm) => {
    document.getElementById('output')!.textContent = `${bpm} BPM`;
  });
});

document.getElementById('stop')?.addEventListener('click', () => {
  stopListening();
});
```

That's the whole thing. The audio thread runs the analyzer, the main
thread renders BPM updates, and `stopListening` is the symmetric inverse
of `startListening` — every resource opened gets closed.

## Why disable echo cancellation

By default, `getUserMedia` returns a stream with three "voice mode"
processors enabled: `echoCancellation`, `noiseSuppression`, and
`autoGainControl`. These are excellent for video calls — they make
speech clearer at the cost of musical content. The compressor in
`autoGainControl` flattens dynamics; `noiseSuppression` removes
exactly the kinds of transients (kick drums, claps, low rumbles) that
beat detection depends on.

Set all three to `false` for music analysis. The signal will be raw —
that's what you want.

```typescript
audio: {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
}
```

## Why no `connect(audioContext.destination)`

The single most common mistake. If you connect a microphone source to
the audio context's `destination`, the speakers play whatever the
microphone hears. The microphone hears whatever the speakers play.
Audio loops back, gain compounds, the user gets a 110 dB feedback
howl, the application is uninstalled.

If you genuinely need to play the microphone back — for example, a
live monitor in a singing app — route through a `GainNode` and keep
its gain low, and warn the user about headphones. For BPM detection,
just don't connect to `destination` at all. The analyzer reads the
samples; nothing else needs to.

## Releasing the microphone

A `MediaStream` returned by `getUserMedia` does not stop when you
disconnect from it. The browser keeps the microphone open and the
recording indicator (red dot, orange dot, depending on OS) lit until
**every track on the stream** has been explicitly stopped.

```typescript
mediaStream.getTracks().forEach((track) => track.stop());
```

Forget this and the user sees a "this site is recording" indicator
forever and they will tell other people you spy on them. Safari in
particular will leave the orange dot lit through entire navigations
across pages.

`AudioContext.close()` does not stop tracks. It releases the audio
thread and disconnects every node, which is necessary, but you must
call `track.stop()` separately. Both, every time.

## Reading the events

Two events fire as audio flows. They mean different things:

- **`bpm`** — fires every chunk (~once per second). Always present,
  often noisy. Use for a live-updating UI display where users want
  immediate feedback.
- **`bpmStable`** — fires when the detection algorithm has high
  confidence in a value. Slower, often 5–15 seconds in. Use as
  "the answer" — pin into application state, persist, log.

For a UI that shows "listening… 122… 124… 122 ✓" the pattern is:

```typescript
bpmAnalyzer.on('bpm', ({ bpm }) => {
  if (bpm.length > 0) {
    setDisplayBpm(bpm[0].tempo); // live
  }
});

bpmAnalyzer.on('bpmStable', ({ bpm }) => {
  if (bpm.length > 0) {
    setStableBpm(bpm[0].tempo); // confident
    setDisplayState('locked');
  }
});
```

`bpm` is sorted by confidence. `bpm[0]` is the top candidate, but for
ambiguous tracks `bpm[1]` may contain the half-time or double-time
alias — useful if you want to render "120 BPM (or 60)" instead of
guessing.

## Mobile gotchas

iOS and Android both add constraints absent from desktop browsers.

**iOS Safari.** The audio context starts in the `suspended` state and
will not move to `running` until you `await audioContext.resume()`
inside a user gesture handler. The microphone permission prompt is
also gated on a user gesture. Both must happen synchronously inside
the same click — `await` between them is fine, but the click handler
must be the call origin. Background tabs suspend the audio context
within ~30 seconds; the `bpm` event will stop firing.

**Android Chrome.** Less strict than iOS but still wants the
permission prompt inside a user gesture. The "noise suppression" mode
on some Android device microphones is aggressive even when disabled
via `getUserMedia` constraints — if accuracy is poor on a specific
phone, an external USB or Bluetooth microphone bypasses the device's
DSP.

**Permission denied.** Always handle the rejection of `getUserMedia`.
The user might have blocked microphone access at the browser level,
the OS level, or for this site specifically. Show a useful error and
a deep link to browser settings.

```typescript
try {
  mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
} catch (err) {
  if (err instanceof DOMException && err.name === 'NotAllowedError') {
    showError('Microphone access denied. Click the lock icon in the URL bar.');
  } else {
    showError(`Microphone unavailable: ${err}`);
  }
}
```

## Tuning for ambient detection

The default lowpass filter (200 Hz, `Q = 1`) is set for a microphone
held close to a speaker or for an instrumental signal in a fairly quiet
room. If your application detects ambient music — coffee shop, gym,
laptop microphone three meters from the source — accuracy will drop
because the kick drum is no longer the dominant low-frequency signal
once it's reflected off walls and mixed with HVAC rumble.

Two tuning levers help:

1. **Move the lowpass cutoff up.** A 400–500 Hz cutoff catches more
   of the low-mid drum content and is more robust to room rumble. You
   can build a custom `BiquadFilterNode` directly:

   ```typescript
   const filter = audioContext.createBiquadFilter();
   filter.type = 'lowpass';
   filter.frequency.value = 400;
   filter.Q.value = 1;
   source.connect(filter).connect(bpmAnalyzer.node);
   ```

2. **Insert a high-pass filter below 60 Hz** to strip room rumble:

   ```typescript
   const highpass = audioContext.createBiquadFilter();
   highpass.type = 'highpass';
   highpass.frequency.value = 60;

   source.connect(highpass).connect(filter).connect(bpmAnalyzer.node);
   ```

For a tap-tempo or beat-along game, where the user hits the
microphone or claps directly, the default filter works fine — the
signal is loud and the room is irrelevant.

## Privacy

Audio captured by the microphone never leaves the device. The Web
Audio API is in-process. `realtime-bpm-analyzer` ships zero network
calls and zero analytics. The samples that reach the analyzer are
processed and discarded; nothing is stored on disk by the library.

This is a useful trust signal in your own UI — say it explicitly. "Audio
is analysed locally in your browser. Nothing is uploaded." Users who
are sensitive about microphone access will be more willing to grant
permission when the boundary is stated up front.

## Try it

The library ships a runnable vanilla microphone example, plus React
and Vue equivalents:

- [Vanilla microphone example](/examples/microphone-input) — drop-in
  HTML + TypeScript.
- [React example](/examples/react#microphone-input) — full source
  including a hook-based version.
- [Vue example](/examples/vue) — composable equivalent.

## What's next

- The [Realtime BPM Detection guide](/guide/realtime-bpm-detection)
  covers the file and HTTP-stream input modes alongside this one.
- The [React useBpm hook](/guide/react-bpm-hook) wraps the pattern
  above in idiomatic React with StrictMode-safe cleanup.
- The [How It Works guide](/guide/how-it-works) explains why the
  algorithm sometimes lands on half-time or double-time aliases and
  what the confidence values mean.

If this library is part of a project you ship, **a star on
[GitHub](https://github.com/dlepaux/realtime-bpm-analyzer)** is the
single highest-leverage way to support continued maintenance.
