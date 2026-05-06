---
title: Realtime BPM Detection in the Browser
description: A practical guide to detecting BPM in real time using the Web Audio API and AudioWorklet — files, microphone, and streams. The modern replacement for the 2014 ScriptProcessorNode tutorials.
head:
  - - meta
    - name: keywords
      content: realtime bpm javascript, web audio bpm, bpm detection javascript, audioworklet bpm, javascript beat detection, detect tempo browser
---

# Realtime BPM Detection in the Browser

Most BPM-detection tutorials on the web were written in 2014. They use
`ScriptProcessorNode`, which has been deprecated since 2019, and they assume
you only ever want to analyse a file you already have on disk. Real
applications — DJ tools, music games, fitness trackers, visualizers — need
to detect tempo **as audio is playing**, from a microphone, an `<audio>`
element, or a live HTTP stream, with no glitches and on a separate audio
thread.

This guide is the modern version. It uses the **AudioWorklet API**, which
runs your analysis off the main thread on a real-time audio rendering
thread. It works the same way across files, microphone input, and streaming
sources, because it operates on `AudioNode` graphs — the universal
abstraction the Web Audio API gives you.

## The shape of the problem

Detecting BPM in the browser is three concerns in a trench coat:

1. **Get audio samples** into a place where you can read them. The Web
   Audio API does this with `AudioContext` and a graph of `AudioNode`s.
2. **Find the beats** in those samples. This is signal processing —
   filtering, peak detection, interval analysis.
3. **Stay out of the way of the UI thread.** Audio analysis on the main
   thread will glitch playback the moment React re-renders or the GC
   pauses.

`realtime-bpm-analyzer` handles (2) and (3) for you. You provide (1) — an
`AudioNode` connected to a source. The rest is library territory.

## Why AudioWorklet matters

The Web Audio API used to expose `ScriptProcessorNode`, which let you read
samples from the audio graph in JavaScript. But it ran on the **main
thread**, in fixed-size chunks, with no real-time guarantees. As soon as
your page did anything else — render a frame, run a layout, garbage
collect — playback would stutter and BPM detection would miss beats.

`AudioWorklet`, shipped in Chrome 66 (2018) and Safari 14.1 (2021), fixes
this by running your processor on the **audio rendering thread**. Samples
arrive in 128-frame quanta with hard real-time deadlines. Nothing the main
thread does can stall it.

`realtime-bpm-analyzer` is AudioWorklet-native. The processor is shipped
inline as part of the bundle and registered for you when you call
`createRealtimeBpmAnalyzer(audioContext)` — no separate hosted file to
configure, no `audioWorklet.addModule` plumbing in your application code.

## Installation

```bash
npm install realtime-bpm-analyzer
```

Browser requirements: any browser with AudioWorklet support — Chrome 66+,
Firefox 76+, Safari 14.1+, Edge 79+. No Internet Explorer, no legacy
fallback. See [Browser Compatibility](/guide/browser-compatibility) for
details.

## The pattern, in one screen

The shape of every realtime BPM integration is identical. Three lines do
the work:

```typescript
import { createRealtimeBpmAnalyzer, getBiquadFilter } from 'realtime-bpm-analyzer';

const audioContext = new AudioContext();
const bpmAnalyzer = await createRealtimeBpmAnalyzer(audioContext);
const lowpass = getBiquadFilter(audioContext);

// Build the source — file, mic, or stream. See sections below.
const source = /* an AudioNode you create */;

// Wire the analysis chain. Filter into analyzer; everything is parallel.
source.connect(lowpass).connect(bpmAnalyzer.node);

// Listen.
bpmAnalyzer.on('bpm', ({ bpm }) => console.log('candidate:', bpm[0]?.tempo));
bpmAnalyzer.on('bpmStable', ({ bpm }) => console.log('stable:', bpm[0]?.tempo));
```

The only thing that changes between use cases is **how you build the
source node**. Three patterns follow.

## Pattern A: an `<audio>` or `<video>` element

The most common case — you have a media element on the page and want to
read its tempo while it plays.

```typescript
import { createRealtimeBpmAnalyzer, getBiquadFilter } from 'realtime-bpm-analyzer';

const audioContext = new AudioContext();
const audioElement = document.querySelector('audio')!;

// Resume the context on user gesture. Required by autoplay policies.
await audioContext.resume();

const source = audioContext.createMediaElementSource(audioElement);
const lowpass = getBiquadFilter(audioContext);
const bpmAnalyzer = await createRealtimeBpmAnalyzer(audioContext);

// Analysis chain — into the analyzer.
source.connect(lowpass).connect(bpmAnalyzer.node);

// Playback chain — straight to the speakers, in parallel.
source.connect(audioContext.destination);

bpmAnalyzer.on('bpmStable', ({ bpm }) => {
  if (bpm.length > 0) {
    console.log(`Stable tempo: ${bpm[0].tempo} BPM`);
  }
});
```

Two things to notice:

1. The source is connected **twice** — once to the analyzer (through the
   filter), once to `destination` so the user actually hears the audio.
   These are independent paths in the audio graph; signal flows down
   both.
2. `createMediaElementSource` **takes ownership** of the element's
   audio. If you do not connect the source to `destination`, you will
   hear nothing. This is a common first-encounter trap.

## Pattern B: microphone (`MediaStream`)

You want to detect BPM from whatever the user's microphone hears — a song
playing in the room, a live performer, a metronome.

```typescript
import { createRealtimeBpmAnalyzer, getBiquadFilter } from 'realtime-bpm-analyzer';

const audioContext = new AudioContext();

// HTTPS is required. getUserMedia only works on secure origins (or localhost).
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

const source = audioContext.createMediaStreamSource(stream);
const lowpass = getBiquadFilter(audioContext);
const bpmAnalyzer = await createRealtimeBpmAnalyzer(audioContext);

source.connect(lowpass).connect(bpmAnalyzer.node);

// Do NOT connect to destination — feedback loop.

bpmAnalyzer.on('bpmStable', ({ bpm }) => {
  if (bpm.length > 0) {
    console.log(`Mic tempo: ${bpm[0].tempo} BPM`);
  }
});
```

Critically: do **not** connect the microphone source to
`audioContext.destination`. The mic captures audio from the speakers,
which then plays through the speakers, which the mic captures again.
Howls, runaway gain, unhappy users. Keep the mic source plugged into the
analyzer only.

For a deeper look at mic-specific concerns — permissions, mobile, ambient
detection — see the dedicated guide:
[How to Detect BPM from a Microphone in JavaScript](/guide/bpm-from-microphone).

## Pattern C: HTTP audio stream (radio, internet streams)

You have a URL — say, an internet radio stream or a long-running shoutcast
URL — and want to monitor its tempo over time.

```typescript
import { createRealtimeBpmAnalyzer, getBiquadFilter } from 'realtime-bpm-analyzer';

const audioContext = new AudioContext();
await audioContext.resume();

// Build an audio element pointed at the stream. The browser handles HTTP,
// the codec, and the buffering for you.
const audio = new Audio('https://example.com/stream.mp3');
audio.crossOrigin = 'anonymous'; // required if the stream sets CORS headers
audio.play();

const source = audioContext.createMediaElementSource(audio);
const lowpass = getBiquadFilter(audioContext);
const bpmAnalyzer = await createRealtimeBpmAnalyzer(audioContext);

source.connect(lowpass).connect(bpmAnalyzer.node);
source.connect(audioContext.destination);

bpmAnalyzer.on('bpmStable', ({ bpm }) => {
  console.log(`Stream tempo: ${bpm[0]?.tempo} BPM`);
});
```

`crossOrigin = 'anonymous'` is the default-correct choice for any stream
served from a different origin. Without it, browsers will refuse to expose
the audio data to the Web Audio API and the analyzer will see silence.

For HLS or DASH streams, you do **not** integrate the player at the
network layer — let `hls.js` or your video framework do its job, and feed
the resulting `<audio>` or `<video>` element into the same
`createMediaElementSource` pattern as above. The library doesn't care
where the bytes came from; it only sees the decoded samples.

## What the events mean

`realtime-bpm-analyzer` emits two BPM-related events. They serve different
purposes and you usually want both.

```typescript
bpmAnalyzer.on('bpm', ({ bpm }) => {
  // Fires roughly every chunk (~once per second).
  // Always available — even early, before detection has settled.
  // Use for a live-updating UI display.
});

bpmAnalyzer.on('bpmStable', ({ bpm }) => {
  // Fires when the algorithm has high confidence in a value.
  // Slower to fire — usually 5–15 seconds in.
  // Use for "the answer" — pinning the BPM into application state.
});
```

The `bpm` array is sorted by confidence. `bpm[0]` is the top candidate;
`bpm[1]` and beyond are alternatives. For tracks where the algorithm is
torn between (say) 120 BPM and its half-time alias 60 BPM, both will
appear, ranked. This is useful — you can render "120 BPM (or 60)" in the
UI rather than guessing.

The library normalises results to the **90–180 BPM** range by halving or
doubling outliers. This is the convention for dance and pop music. If you
need to detect BPM outside this range — drum & bass at 175, ambient at 60,
classical accelerando — see [How It Works](/guide/how-it-works) for
details on tuning.

## The lowpass filter — why it's there

Every example above includes `getBiquadFilter(audioContext)` between the
source and the analyzer. This is a 200 Hz low-pass filter with `Q = 1`.

The reason: most beats live in the **low-frequency transients** of the
signal — kick drums, basslines, the thump on the floor. By stripping
everything above 200 Hz before peak detection, you make the kick the
dominant signal in the analyser's input. Without the filter, vocals,
hi-hats, and synth leads add competing peaks and accuracy drops on
genre-non-EDM material.

The filter is a `BiquadFilterNode` from the Web Audio API — standard,
free, no overhead. You can omit it if you know your audio is already
low-frequency-only (for example, a kick-only stem) or if you want to
experiment with detection on full-spectrum signal.

## Stopping cleanly

Always tear down the audio graph when you're done. Otherwise you leak
audio threads, hold microphones open, and surprise the user the next time
they navigate.

```typescript
// Disconnect and free the analyzer.
bpmAnalyzer.disconnect();

// Close the audio context — releases the audio thread.
await audioContext.close();

// If you're using a microphone, also stop the MediaStream tracks.
stream.getTracks().forEach((track) => track.stop());
```

In a single-page application, run the disconnect path on route change or
component unmount. Browsers will eventually reclaim everything when the
page is closed, but eventually is not soon enough — Safari in particular
keeps the orange microphone indicator lit until you stop the tracks.

## Edge cases worth knowing

**Silence.** The analyzer will emit no `bpmStable` event when there is no
detectable rhythm. Show a "still listening…" UI rather than waiting
forever; if no stable BPM arrives in 20 seconds with audible audio, the
material is probably ambient or beatless.

**Very short clips.** Below ~5 seconds the algorithm has too few peaks to
form a stable interval distribution. For one-shot file analysis on short
samples, results are best treated as approximate.

**Tempo changes.** The analyzer adapts but lags. A track that ramps from
120 to 140 BPM mid-song will surface both candidates in the `bpm` event;
the `bpmStable` event will eventually retarget. For DJ tools that need
sample-accurate tempo tracking through transitions, you may want to call
`bpmAnalyzer.reset()` on the transition boundary.

**Non-4/4 time signatures.** All time-domain BPM detection algorithms
struggle with irregular meters — jazz, classical, hip-hop with off-beats.
This library is no exception. Confidence will be lower; alternative
candidates more interesting. Use `bpm[0].confidence` to decide whether to
display the result or fall back to a "tap tempo" UI.

**iOS Safari.** The audio context **must** be created or resumed inside a
user gesture handler — a click, a touch. Browsers will silently keep the
context in the `suspended` state otherwise and you will read zero
samples.

## What's next

- The [Microphone tutorial](/guide/bpm-from-microphone) covers permissions,
  mobile gotchas, and ambient detection in depth.
- The [React hook tutorial](/guide/react-bpm-hook) wraps everything above
  in a typed `useBpm` hook with StrictMode-safe cleanup.
- The [How It Works guide](/guide/how-it-works) opens the algorithm —
  threshold scanning, peak detection, interval grouping, confidence
  scoring.
- The [API reference](/api/) has the full type signatures.
- The [examples directory](https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/examples)
  has nine runnable apps across vanilla JS, React, and Vue.

If this library helped, **give it a star on
[GitHub](https://github.com/dlepaux/realtime-bpm-analyzer)** — it's the
single most useful thing you can do to support continued development.
