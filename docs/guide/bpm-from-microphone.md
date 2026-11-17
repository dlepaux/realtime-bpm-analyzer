---
title: Detect BPM from the Microphone in JavaScript
description: Read the tempo of live music from the microphone with getUserMedia and the Web Audio API. HTTPS and permissions, why to turn off echo cancellation, iOS, cleanup, and a working TypeScript pattern.
head:
  - - meta
    - name: keywords
      content: bpm from microphone javascript, microphone bpm detection, web audio api microphone, getUserMedia bpm, javascript live bpm, realtime bpm microphone
---

# Detect BPM from the Microphone in JavaScript

To detect BPM from the microphone, open it with `getUserMedia` and its voice
processing turned off, connect it to `realtime-bpm-analyzer`'s AudioWorklet
node, and read the tempo from its `reading` events, and once it is sure, from
its `statechange` to `locked`. The microphone picks up
more noise than a file or a stream: room reverb, background noise, a keyboard
or a laptop fan all reach the signal. It is also the source a live
performance tool, a music game or a fitness app needs.

The tempo is one number. Where each beat falls is a different task, which
[Beat detection in the browser](/guide/beat-detection-web-audio) explains.

Only want the BPM of the music around you, not code? The
[tool on the home page](/) listens to the microphone in your browser.

The pattern below uses `realtime-bpm-analyzer` and the AudioWorklet API
to keep analysis off the main thread. It handles permissions and HTTPS,
and avoids two common mistakes: a feedback loop and microphone tracks
left open.

## What you'll get

A web page that:

- Asks the user for microphone permission via `getUserMedia`.
- Routes the microphone signal into a BPM analyzer running on the audio
  thread.
- Locks on a BPM value once detection settles: after about 11.5 seconds
  of audio at the earliest, longer when the rhythm is faint.
- Releases the microphone cleanly when the user stops.

It does **not** play the microphone back through the speakers, which
would create a feedback loop. The audio is captured, analysed, and
discarded.

## Prerequisites

Three requirements:

1. **HTTPS or localhost.** The `getUserMedia` API only works on secure
   origins. Local development on `http://localhost` works; staging on
   `http://192.168.1.10` does not.
2. **A user gesture.** Both the microphone permission prompt and the
   `AudioContext` resume must happen inside a click, touch, or
   keypress handler. Otherwise the browser refuses without an error, so
   the page needs a "Start listening" button.
3. **AudioWorklet support.** Chrome 66+, Firefox 76+, Safari 14.1+ or
   Edge 79+. iOS Safari under 14.5 has known issues, so show a warning
   there.

## Installation

```bash
npm install realtime-bpm-analyzer
```

## The complete pattern

```typescript
import { createRealtimeBpmAnalyzer, type BpmAnalyzer } from 'realtime-bpm-analyzer';

let audioContext: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
let analyzer: BpmAnalyzer | null = null;

async function startListening(onBpm: (bpm: number) => void) {
  // 1. Build the audio context inside the user gesture.
  audioContext = new AudioContext();
  await audioContext.resume();

  // 2. Ask for microphone access. Disable noise suppression and echo
  //    cancellation: they're tuned for voice and remove the
  //    rhythmic transients we want to detect.
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  // 3. Build the audio graph: mic -> analyzer. `.input` holds what the
  //    engine needs in front of it. `liveInput` lets the
  //    analyzer follow the track's clock, so audio the browser drops
  //    doesn't speed the tempo up.
  const [track] = mediaStream.getAudioTracks();
  const source = audioContext.createMediaStreamSource(mediaStream);
  analyzer = await createRealtimeBpmAnalyzer(audioContext, { liveInput: track });

  source.connect(analyzer.input);
  // Note: do NOT connect to audioContext.destination. Feedback loop.

  // 4. Surface locked detections to the application.
  analyzer.on('statechange', ({ to }) => {
    if (to.status === 'locked') {
      onBpm(to.reading.bpm);
    }
  });
}

async function stopListening() {
  // stop() is final: the next start creates a new analyzer.
  analyzer?.stop();
  analyzer = null;

  // Stop every track on the MediaStream. Without this the browser
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

The audio thread runs the analyzer, the main thread renders BPM updates,
and `stopListening` closes every resource `startListening` opened.

## Why disable echo cancellation

By default, `getUserMedia` returns a stream with three "voice mode"
processors enabled: `echoCancellation`, `noiseSuppression`, and
`autoGainControl`. They are made for video calls: they make speech
clearer at the cost of musical content. The compressor in
`autoGainControl` flattens dynamics; `noiseSuppression` removes
exactly the kinds of transients (kick drums, claps, low rumbles) that
beat detection depends on.

Set all three to `false` for music analysis, so the analyzer gets the
raw signal.

<!-- typecheck: skip, a fragment of the getUserMedia call above -->
```typescript
audio: {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
}
```

## Why no `connect(audioContext.destination)`

If you connect a microphone source to the audio context's
`destination`, the speakers play whatever the microphone hears, and the
microphone hears whatever the speakers play. The audio loops back, the
gain builds up, and the user hears loud feedback.

If you do need to play the microphone back, for example as a live
monitor in a singing app, route it through a `GainNode` with a low gain
and ask the user to wear headphones. For BPM detection, don't connect to
`destination` at all. The analyzer reads the
samples; nothing else needs to.

## Releasing the microphone

A `MediaStream` returned by `getUserMedia` does not stop when you
disconnect from it. The browser keeps the microphone open and the
recording indicator (red dot, orange dot, depending on OS) lit until
**every track on the stream** has been explicitly stopped.

```typescript
stream.getTracks().forEach((track) => track.stop());
```

Without it, the browser keeps showing that the site is recording.
Safari keeps the orange dot lit even as the user moves between pages.

`AudioContext.close()` does not stop tracks. It releases the audio
thread and disconnects every node, which is necessary, but you must
call `track.stop()` separately. Both, every time.

## Reading the events

The analyzer has a state, `analyzer.state`, and events that report each
change. They mean different things:

- **`reading`** fires on every analysis step once the first reading
  is in: every half second with the default tempogram engine, after its
  first 4 s of warm-up, and about ten times a second with `peaks`. It arrives
  early and is often noisy. Use it for a live display where users want
  immediate feedback.
- **`statechange`** fires when the status changes. The move to `locked`
  comes when the engine trusts a value: with the default tempogram engine,
  about 11.5 seconds in at the earliest, and 10 seconds with `peaks`. Use it as "the answer": keep it in application state,
  persist it, log it.

For a UI that shows "listening, 122, 124, 122, locked", the pattern is:

```typescript
const statusDisplay = document.getElementById('status')!;

analyzer.on('reading', ({ bpm }) => {
  bpmDisplay.textContent = `${bpm} BPM`; // live
});

analyzer.on('statechange', ({ to }) => {
  // 'listening', 'settling', 'locked' or 'stopped'
  statusDisplay.textContent = to.status;
});
```

A reading carries the tempo to show, `bpm`, and up to five `candidates`,
the top one first, each with its `relation` to that tempo: `top`, `half`,
`double` or `other`. Every tempo is folded into the default range of 90
to 180 BPM, so half-time and double-time readings usually land on the
same value; pass `tempoRange: { min: 70, max: 140 }` for slower music so
an 85 BPM track reads 85 rather than 170.

## Mobile browsers {#mobile-gotchas}

iOS and Android both add constraints absent from desktop browsers.

**iOS Safari.** The audio context starts in the `suspended` state and
will not move to `running` until you `await audioContext.resume()`
inside a user gesture handler. The microphone permission prompt is
also gated on a user gesture. Both must happen synchronously inside
the same click: `await` between them is fine, but the click handler
must start the chain. Background tabs suspend the audio context within
about 30 seconds, and `reading` events then stop.

**Android Chrome.** Less strict than iOS but still wants the
permission prompt inside a user gesture. The "noise suppression" mode
on some Android device microphones stays on even when disabled via
`getUserMedia` constraints. If readings are poor on a specific phone, an
external USB or Bluetooth microphone bypasses the device's processing.

**Permission denied.** Always handle the rejection of `getUserMedia`.
The user might have blocked microphone access at the browser level,
the OS level, or for this site specifically. Show a useful error and
a deep link to browser settings.

```typescript
const showError = (message: string) => {
  document.getElementById('error')!.textContent = message;
};

// Resolves to the stream, or to null after showing why there is none.
// The caller keeps the stream and stops its tracks when done.
async function requestMicrophone(): Promise<MediaStream | null> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      showError('Microphone access denied. Click the lock icon in the URL bar.');
    } else {
      showError(`Microphone unavailable: ${err}`);
    }
    return null;
  }
}
```

## Tuning for ambient detection

With `engine: 'peaks'`, the lowpass filter `.input` holds (200 Hz, `Q = 1`) is set for a microphone
held close to a speaker or for an instrumental signal in a fairly quiet
room. If your application listens to music in a room (a coffee shop,
a gym, a laptop microphone three meters from the speaker), readings get
less reliable, because the kick drum is no longer the strongest
low-frequency signal once it's reflected off walls and mixed with
ventilation rumble.

Two settings help. Both replace the filter that `.input` provides, so
connect your own chain to `analyzer.node`, the analyzer with nothing
in front of it:

1. **Move the lowpass cutoff up.** A cutoff of 400 to 500 Hz catches
   more of the low-mid drum content and is less affected by room
   rumble. Build a `BiquadFilterNode` directly:

   ```typescript
   const filter = audioContext.createBiquadFilter();
   filter.type = 'lowpass';
   filter.frequency.value = 400;
   filter.Q.value = 1;
   source.connect(filter).connect(analyzer.node);
   ```

2. **Insert a high-pass filter below 60 Hz** to strip room rumble:

   <!-- typecheck: skip, continues the block above -->
   ```typescript
   const highpass = audioContext.createBiquadFilter();
   highpass.type = 'highpass';
   highpass.frequency.value = 60;

   source.connect(highpass).connect(filter).connect(analyzer.node);
   ```

For a tap-tempo or beat-along game, where the user taps the
microphone or claps close to it, the default filter is enough: the
signal is loud and the room matters little.

## Privacy

Audio captured by the microphone never leaves the device. The Web
Audio API runs in the browser, and `realtime-bpm-analyzer` makes no
network call of its own and collects nothing. The samples that reach the
analyzer are processed and discarded; the library stores nothing on disk.

Say this in your own UI: "Audio is analysed locally in your browser and
never uploaded." Users wary of microphone access are more likely to
grant it when this is stated up front. Keep the sentence about
the audio: if your page runs analytics, that is a separate thing to disclose.

## Try it

The library ships a runnable vanilla microphone example, plus React
and Vue equivalents:

- [Vanilla microphone example](/examples/microphone-input): HTML and
  TypeScript you can drop in.
- [React example](/examples/react#microphone-input): full source,
  including a hook-based version.
- [Vue example](/examples/vue): the same as a composable.

## What's next

- The [Realtime BPM Detection guide](/guide/realtime-bpm-detection)
  covers the file and HTTP-stream input modes alongside this one.
- The [React useBpm hook](/guide/react-bpm-hook) wraps the pattern
  above in idiomatic React with StrictMode-safe cleanup.
- The [How It Works guide](/guide/how-it-works) explains why the
  algorithm sometimes lands on half-time or double-time aliases.

If this library is part of a project you ship, a star on
[GitHub](https://github.com/dlepaux/realtime-bpm-analyzer) helps other
developers find it.
