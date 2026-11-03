---
title: Detect BPM in Real Time with JavaScript
description: "Detect BPM in real time with JavaScript: the tempo of an audio or video element, the microphone or a live stream, with Web Audio and an AudioWorklet."
head:
  - - meta
    - name: keywords
      content: realtime bpm javascript, web audio bpm, bpm detection javascript, audioworklet bpm, detect tempo browser, detect bpm javascript
---

# Detect BPM in Real Time with JavaScript

To detect BPM in real time, connect the audio source to
`realtime-bpm-analyzer`'s AudioWorklet node and read the tempo from its `bpm`
and `bpmStable` events. The source can be an `<audio>` or `<video>` element,
a microphone or a live HTTP stream. The analysis runs on the audio thread, so
the page's own work can't stall it.

Only need the BPM of a song, not code? The [free tool on the home page](/)
reads a file, a radio stream URL or the microphone.

The pattern below runs on the audio thread through an `AudioWorklet`, not
the deprecated `ScriptProcessorNode`, and works the same way for every
source, because it works on `AudioNode` graphs. To analyse a whole file at
once instead, see
[Beat detection in the browser](/guide/beat-detection-web-audio#tempo-of-a-whole-file).

## The shape of the problem

Detecting BPM in the browser comes down to three tasks:

1. **Get audio samples** into a place where you can read them. The Web
   Audio API does this with `AudioContext` and a graph of `AudioNode`s.
2. **Find the beats** in those samples. This is signal processing:
   filtering, peak detection and interval analysis.
3. **Stay off the UI thread.** Audio analysis on the main thread glitches
   playback whenever React re-renders or the garbage collector pauses.

`realtime-bpm-analyzer` handles (2) and (3). You provide (1): an
`AudioNode` connected to a source.

## Why AudioWorklet matters

The Web Audio API used to expose `ScriptProcessorNode`, which let you read
samples from the audio graph in JavaScript. But it ran on the **main
thread**, in fixed-size chunks, with no real-time guarantees. Whenever the
page did anything else (render a frame, run a layout, collect garbage),
playback could stutter and BPM detection could miss beats.

`AudioWorklet`, shipped in Chrome 66 (2018) and Safari 14.1 (2021), runs
your processor on the **audio rendering thread** instead. Samples arrive
in 128-frame quanta with hard real-time deadlines, and nothing the main
thread does can stall it.

`realtime-bpm-analyzer` ships its processor inline in the bundle and
registers it when you call `createRealtimeBpmAnalyzer(audioContext)`, so
there is no separate file to host and no `audioWorklet.addModule` call in
your application code.

## Installation

```bash
npm install realtime-bpm-analyzer
```

Browser requirements: a browser with AudioWorklet support, which means
Chrome 66+, Firefox 76+, Safari 14.1+ or Edge 79+. There is no Internet
Explorer support and no legacy fallback. See
[Browser Compatibility](/guide/browser-compatibility) for details.

## The pattern, in one screen

Every realtime integration has the same shape:

```typescript
import { createRealtimeBpmAnalyzer } from 'realtime-bpm-analyzer';

const audioContext = new AudioContext();
const bpmAnalyzer = await createRealtimeBpmAnalyzer(audioContext);

// Build the source: file, mic, or stream. See the sections below.
const source = /* an AudioNode you create */;

// Connect the source to the analyzer's input.
source.connect(bpmAnalyzer.input);

// Listen.
bpmAnalyzer.on('bpm', ({ bpm }) => console.log('candidate:', bpm[0]?.tempo));
bpmAnalyzer.on('bpmStable', ({ bpm }) => console.log('stable:', bpm[0]?.tempo));
```

`bpmAnalyzer.input` is the node a source connects to. It holds what the
detector needs in front of it: the 200 Hz lowpass filter for the default
`peaks` detector, and nothing for `tempogram`. So the wiring stays the same
whichever detector you choose. It was added in version 5.5.0.

The only thing that changes between use cases is **how you build the
source node**. Three patterns follow.

## Pattern A: an `<audio>` or `<video>` element

You have a media element on the page and want to read its tempo while it
plays.

```typescript
import { createRealtimeBpmAnalyzer } from 'realtime-bpm-analyzer';

const audioContext = new AudioContext();
const audioElement = document.querySelector('audio')!;

// Resume the context on user gesture. Required by autoplay policies.
await audioContext.resume();

const source = audioContext.createMediaElementSource(audioElement);
const bpmAnalyzer = await createRealtimeBpmAnalyzer(audioContext);

// Analysis chain: into the analyzer.
source.connect(bpmAnalyzer.input);

// Playback chain: straight to the speakers, in parallel.
source.connect(audioContext.destination);

bpmAnalyzer.on('bpmStable', ({ bpm }) => {
  if (bpm.length > 0) {
    console.log(`Stable tempo: ${bpm[0].tempo} BPM`);
  }
});
```

Two things to notice:

1. The source is connected **twice**: once to the analyzer and once to
   `destination`, so the user hears the audio. These are independent
   paths in the audio graph, and the signal flows down both.
2. `createMediaElementSource` **takes over** the element's audio. If you
   do not connect the source to `destination`, you hear nothing.

## Pattern B: microphone (`MediaStream`)

You want the tempo of whatever the user's microphone hears: a song
playing in the room, a live performer, a metronome.

```typescript
import { createRealtimeBpmAnalyzer } from 'realtime-bpm-analyzer';

const audioContext = new AudioContext();

// HTTPS is required. getUserMedia only works on secure origins (or localhost).
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  },
});

const source = audioContext.createMediaStreamSource(stream);
const bpmAnalyzer = await createRealtimeBpmAnalyzer(audioContext);

source.connect(bpmAnalyzer.input);

// Do NOT connect to destination: that makes a feedback loop.

bpmAnalyzer.on('bpmStable', ({ bpm }) => {
  if (bpm.length > 0) {
    console.log(`Mic tempo: ${bpm[0].tempo} BPM`);
  }
});
```

Do **not** connect the microphone source to `audioContext.destination`.
The speakers would play what the microphone hears, the microphone would
pick it up again, and the loop builds into loud feedback. Keep the
microphone source connected to the analyzer only.

For permissions, mobile browsers and ambient rooms, see the dedicated
guide:
[How to Detect BPM from a Microphone in JavaScript](/guide/bpm-from-microphone).

## Pattern C: HTTP audio stream (radio, internet streams)

You have a URL, such as an internet radio stream or a long-running
Shoutcast URL, and want to follow its tempo over time.

```typescript
import { createRealtimeBpmAnalyzer } from 'realtime-bpm-analyzer';

const audioContext = new AudioContext();
await audioContext.resume();

// Build an audio element pointed at the stream. The browser handles HTTP,
// the codec, and the buffering for you.
const audio = new Audio('https://example.com/stream.mp3');
audio.crossOrigin = 'anonymous'; // required if the stream sets CORS headers
audio.play();

const source = audioContext.createMediaElementSource(audio);
const bpmAnalyzer = await createRealtimeBpmAnalyzer(audioContext);

source.connect(bpmAnalyzer.input);
source.connect(audioContext.destination);

bpmAnalyzer.on('bpmStable', ({ bpm }) => {
  console.log(`Stream tempo: ${bpm[0]?.tempo} BPM`);
});
```

Set `crossOrigin = 'anonymous'` for any stream served from a different
origin. Without it, the browser refuses to expose the audio data to the
Web Audio API and the analyzer receives silence.

For HLS or DASH streams, you do **not** integrate the player at the
network layer. Let `hls.js` or your video framework play the stream, and
feed the resulting `<audio>` or `<video>` element into the same
`createMediaElementSource` pattern as above. The library only sees the
decoded samples, wherever they came from.

## What the events mean

`realtime-bpm-analyzer` emits two BPM events. They serve different
purposes and you usually want both.

```typescript
bpmAnalyzer.on('bpm', ({ bpm }) => {
  // Fires on every analysed chunk: about ten times a second with the
  // default detector, every half second with the tempogram.
  // Arrives early, before detection has settled, and can be empty at first.
  // With the tempogram it does not fire at all for the first 4 s (warm-up).
  // Use for a live-updating display.
});

bpmAnalyzer.on('bpmStable', ({ bpm }) => {
  // Fires once the detector trusts a value: after 10 s of audio at the
  // earliest with the default detector, about 11.5 s with the tempogram.
  // It can fire again later as the reading firms up.
  // Use for "the answer": the BPM you keep in application state.
});
```

In plain words: `bpm` gives you a running guess right away, and
`bpmStable` comes no sooner than about ten seconds in, once the detector
is willing to stand behind a value.

The `bpm` array is sorted by `count`, the number of peak intervals that
voted for each tempo. `bpm[0]` is the top candidate; `bpm[1]` and beyond
are alternatives. Each candidate also carries a `confidence`: the share of
all votes within ±1 BPM of it, from 0 to 1. Compare it between candidates
or over time; no absolute cut-off has been calibrated on real music yet.

The library folds every tempo into the **90 to 180 BPM** range by halving
or doubling it. This is the convention for dance and pop music, but it
reads an 85 BPM hip-hop track as 170. A tempo and its double usually fold
onto the same value, so you cannot pick the octave from the candidates.
Pick it with the `tempoRange` option instead:

```typescript
const bpmAnalyzer = await createRealtimeBpmAnalyzer(audioContext, {
  tempoRange: { min: 70, max: 140 }, // hip-hop, R&B, downtempo
});
```

`max` must be at least twice `min`, so that every tempo has an octave
inside the range; anything narrower throws a `RangeError`. Keep your
music's tempo away from the edges: a tempo sitting right on a bound (140
in a 70 to 140 range) jitters across it, and its votes split between 140
and 70, which lowers its count and confidence. In plain words: choose a
range whose middle is where your music usually sits. See
[How It Works](/guide/how-it-works) for the algorithm.

## The tempogram detector

An experimental detector reads the tempo from an onset tempogram rather
than from peaks in low-passed audio. It weighs tempos with a prior instead
of folding them, and it only calls a tempo stable once the tempo agreed
over several seconds and clearly leads its rivals. Opt in with the
`detector` option, and connect the source to `bpmAnalyzer.input`, as for
the default detector. For the tempogram, `.input` adds no filter, because
it needs the full frequency band. Don't put `getBiquadFilter` in front of
it.

```typescript
const bpmAnalyzer = await createRealtimeBpmAnalyzer(audioContext, {
  detector: 'tempogram',
});

source.connect(bpmAnalyzer.input);
```

`analyzeFullBuffer(buffer, {detector: 'tempogram'})` and `analyzeChannelData`
in Node run it on whole files. The default stays `'peaks'`.

It searches 90 to 180 BPM, and a tempo outside that reads at the octave
inside: over about 179 BPM reads half, so a 200 BPM track reads 100, and a
70 BPM track reads 140. In plain words: very fast or very slow music comes
back at half or double its real tempo.

`tempoRange` changes what is searched, but nothing is folded into it. A
tempo from about twice `min` up can read at half or a quarter, whatever
`max` is, so a lower `min` halves more music and a higher `max` does not
reach faster music. On a range wider than one octave, which of those
tempos halve varies from one to the next. On clean click tracks:

| `tempoRange` | Reads as itself | Reads at half |
| --- | --- | --- |
| 60 to 180 | 116, 140 | 120 as 60, 160 as 80 |
| 70 to 140 | 130 | 140 as 70 |
| 90 to 240 | 170 | 180 as 90 |

In plain words: with the tempogram, widening `tempoRange` does not make it
read faster music correctly, and it can make some tempos read at half, so
keep the default unless you have tested your range on your own music.

These settings were measured on real-time analysis at 90 to 180 only, and
whole files run the same settings without having been scored at them.
`continuousAnalysis` works with it too, but a short `stabilizationTime`
resets it before it can reach stable: at 10 seconds it never does. In
plain words: with `continuousAnalysis`, give `stabilizationTime` well over
10 seconds, or `bpmStable` never comes.

### `tempogramMode: 'extension'`

For a browser extension or any other page listening to a tab, which wants
to be sure it runs the settings that were measured. It reads exactly as
`detector: 'tempogram'` does, and refuses what would leave those settings:
a `tempoRange` other than 90 to 180, and `continuousAnalysis`. So over 180
BPM still reads half. It applies to real-time analysis only.

```typescript
const bpmAnalyzer = await createRealtimeBpmAnalyzer(audioContext, {
  detector: 'tempogram',
  tempogramMode: 'extension',
});

source.connect(bpmAnalyzer.input);
```

### `liveInput` for a MediaStream

A MediaStream arrives in real time whatever the audio thread does. When the
thread stays behind, the browser drops part of the stream, and the analyzer
reads a tempo as high as it lost: 150 BPM reads 167 at 10% lost, marked
stable. In plain words: if the browser drops a tenth of the audio, the
tempo comes out about a tenth too fast, and is still called stable.

Given the track, the analyzer follows the track's clock and counts what was
lost as silence. That brings the number close to the tempo and no more than
that: under sustained loss in Chrome, tab capture read 148 for 150, and 117
and 118 for 120. In plain words: with `liveInput`, a reading under heavy
loss lands within a few BPM of the real tempo, but not exactly on it.

So what it mostly guards is the word stable:

- While about 5% or more is being lost, `bpm` keeps coming but `bpmStable`
  does not. The edge is soft, because the clock moves in steps: in
  simulation 96% render was behind for part of the time, and a lock could
  come late. Smaller loss is paid the same way and can lock. In plain
  words: while the browser drops a noticeable share of the audio, you get
  live readings but no stable one.
- When the loss ends, about 3 s later, the analyzer starts over and emits
  `analyzerReset`, if a lock was held back, or if it lost 0.3 s or more and
  had published no lock 3 s or more before the loss showed. It then locks
  on what it hears from there, about 11 s later with the tempogram. In
  simulation every lock after that was right, across loss of 0.3 s to 3 s
  and 100 to 174 BPM. A smaller drop doesn't start it over: those locks
  read within 1 BPM. In plain words: after a real dropout, the stable
  reading comes back about 14 seconds after the dropout ends, and in
  simulation it was right every time.
- A loss takes up to 3 s of audio to show, so a lock published within 3 s
  before it shows may have heard some of it. When 0.3 s or more is lost,
  that lock is withdrawn: the analyzer starts over as above. A lock
  published earlier stands, and nothing tells the main thread it has since
  heard less. In plain words: a stable reading that arrived just before a
  dropout is taken back; an older one is kept.
- While reports of the track's clock stop for about 3 s, as they can on a
  hidden page whose timers are throttled, a lock is held back too: the
  clock can't vouch for it, and a window with no report doesn't count as
  clean.
- Under loss that never ends it never locks.

Limits, since this is only as good as what was measured:

- `MediaStreamTrack.stats` is specified for `getUserMedia` tracks. A track
  from `captureStream`, a remote peer or a `MediaStreamAudioDestinationNode`
  may have no stats, and then, as in a browser without them, this does
  nothing and says nothing.
- The specification says these frame counters lack Working Group
  consensus, so a browser could change them.
- Loss was measured on Chrome tab capture on Linux, and in simulation. A
  microphone, Windows and a laptop on battery were not measured.
- When the whole browser loses the CPU, the track slows with the thread and
  this clock sees no loss. Only the track against the system clock shows
  that.

The clock follows the track until the track ends or `stop()` is called, so
call `stop()` before closing the context.

```typescript
const [track] = stream.getAudioTracks();
const bpmAnalyzer = await createRealtimeBpmAnalyzer(audioContext, {
  detector: 'tempogram',
  liveInput: track,
});

audioContext.createMediaStreamSource(stream).connect(bpmAnalyzer.input);
```

A media element or a buffer has no such track: those wait for the thread
and lose nothing.

## The lowpass filter: why it's there {#the-lowpass-filter-—-why-it-s-there}

With the default `peaks` detector, `bpmAnalyzer.input` puts a 200 Hz
low-pass filter with `Q = 1` between the source and the analyzer. It is
the same filter `getBiquadFilter(audioContext)` builds.

Most beats live in the **low-frequency transients** of the signal: kick
drums, basslines. Removing everything above 200 Hz before peak detection
makes the kick the strongest signal the detector sees. Without the filter,
vocals, hi-hats and synth leads add competing peaks, and readings get less
reliable on music without a strong kick.

To use a filter of your own (a different cutoff, or a high-pass in front),
connect your chain to `bpmAnalyzer.node`, which is the analyzer itself
with nothing in front of it. The
[microphone guide](/guide/bpm-from-microphone#tuning-for-ambient-detection)
shows an example.

## Stopping cleanly

Tear down the audio graph when you're done. Otherwise the audio thread
keeps running, the microphone stays open, and the browser keeps showing
its recording indicator.

```typescript
// Stop the analysis. This also stops following a liveInput track.
bpmAnalyzer.stop();

// Close the audio context. This releases the audio thread.
await audioContext.close();

// If you're using a microphone, also stop the MediaStream tracks.
stream.getTracks().forEach((track) => track.stop());
```

In a single-page application, run this on route change or component
unmount. The browser reclaims everything when the page closes, but not
before, and Safari keeps its orange microphone indicator lit until you
stop the tracks.

## Edge cases worth knowing

**Silence.** The analyzer emits no `bpmStable` event when there is no
detectable rhythm. Show a "still listening" state rather than waiting
forever; if no stable BPM arrives in 20 seconds of audible audio, the
material is probably ambient or has no beat.

**Very short clips.** Below about 5 seconds the algorithm has too few
peaks to form a stable interval distribution, and `bpmStable` waits for 10
seconds of audio. For short samples, treat the `bpm` reading as
approximate.

**Tempo changes.** The analyzer adapts, with a delay. A track that ramps
from 120 to 140 BPM mid-song will show both candidates in the `bpm` event,
and `bpmStable` follows later. For DJ tools that need to follow the tempo
through a transition, call `bpmAnalyzer.reset()` at the transition.

**Meters other than 4/4.** Irregular meters (jazz, some classical music,
hip-hop with off-beats) give lower confidence and more competing
candidates. A `bpm[0].confidence` well below what your regular material
scores is a cue to offer a tap tempo input instead.

**iOS Safari.** The audio context **must** be created or resumed inside a
user gesture handler, such as a click or a touch. Otherwise the browser
keeps the context `suspended` without an error, and the analyzer receives
no samples.

## What's next

- The [Microphone tutorial](/guide/bpm-from-microphone) covers
  permissions, mobile browsers and ambient detection in depth.
- The [React hook tutorial](/guide/react-bpm-hook) wraps everything above
  in a typed `useBpm` hook with StrictMode-safe cleanup.
- The [How It Works guide](/guide/how-it-works) opens the algorithm:
  threshold scanning, peak detection, interval grouping and confidence
  scoring.
- The [API reference](/api/) has the full type signatures.
- The [examples directory](https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/examples)
  has nine runnable apps across vanilla JS, React, and Vue.

If this library helps you, a star on
[GitHub](https://github.com/dlepaux/realtime-bpm-analyzer) helps other
developers find it.
