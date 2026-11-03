---
title: Beat Detection in the Browser with Web Audio
description: "Beat detection in JavaScript with the Web Audio API: onsets, tempo and beat tracking explained, an onset sketch, and the tempo of live audio and files."
head:
  - - meta
    - name: keywords
      content: javascript beat detection, web audio beat detection, detect beats javascript, onset detection web audio, web audio api tempo, beat tracking javascript
---

# Beat Detection in the Browser with Web Audio

Beat detection is three tasks: onset detection finds when each sound starts,
tempo estimation finds how fast the music is, and beat tracking finds where
each beat falls. They need different code. Below is a small onset detector
built on the Web Audio API alone, then the tempo of live audio and of whole
files with `realtime-bpm-analyzer`, and where its limits are.

## Three questions behind "beat detection"

| Question | Answer looks like | Typical use |
| --- | --- | --- |
| **Onset detection**: when does a new sound start? | A list of times, one per hit, note or kick | Flashing a light on each kick, triggering an animation |
| **Tempo estimation**: how fast is the music? | One number, such as 128 BPM | Showing the BPM, matching tracks, setting a delay time |
| **Beat tracking**: where does each beat fall? | A regular grid of times, in phase with the music | Cutting video to the beat, a pulse that lands on the beat |

They build on each other. Onsets are irregular: a drum fill has many, a
held pad has none. Tempo is the regular period hidden in those onsets. Beat
tracking needs both the period and the phase, that is where the first beat
sits.

`realtime-bpm-analyzer` answers the second question: it estimates the tempo.
It does not report where each beat falls. Beat events are planned.

## Onsets with an AnalyserNode

An onset detector can be a few lines of plain Web Audio: watch the loudness of
the low frequencies and report a jump above the recent average. This sketch
needs no library.

```typescript
const audioContext = new AudioContext();
const audioElement = document.querySelector('audio')!;
const source = audioContext.createMediaElementSource(audioElement);

// Keep the kick and the bass, drop the rest.
const lowpass = audioContext.createBiquadFilter();
lowpass.type = 'lowpass';
lowpass.frequency.value = 150;

const analyser = audioContext.createAnalyser();
analyser.fftSize = 1024;
const samples = new Float32Array(analyser.fftSize);

source.connect(lowpass).connect(analyser);
source.connect(audioContext.destination); // keep playback audible

let average = 0;
let lastOnset = 0;

function detectOnset(now: number) {
  analyser.getFloatTimeDomainData(samples);
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  const energy = Math.sqrt(sum / samples.length);

  // An onset: clearly louder than the recent average, and not right after the last one.
  if (energy > average * 1.5 && energy > 0.02 && now - lastOnset > 250) {
    lastOnset = now;
    console.log('onset at', audioContext.currentTime.toFixed(2), 's');
  }
  average = average * 0.95 + energy * 0.05;
  requestAnimationFrame(detectOnset);
}

audioElement.addEventListener('play', async () => {
  await audioContext.resume(); // play is a user gesture, so the context may start
  requestAnimationFrame(detectOnset);
}, { once: true });
```

What this gives you, and what it doesn't:

- It reads the signal once per animation frame, about 60 times a second, on
  the main thread. Onset times are as precise as that, and a busy page or a
  background tab skips frames.
- The `1.5`, `0.02` and `250` ms values are starting points. Quiet recordings,
  dense mixes and fast tempos each need other values.
- It reports hits, not beats. Syncopated kicks and fills produce onsets off
  the beat, and a bar with no kick produces none.

For a visual that reacts to loud hits, that is often enough. To know how fast
the music is, use a tempo estimator.

## Tempo of live audio

`createRealtimeBpmAnalyzer` analyses audio while it plays, in an AudioWorklet
on the audio thread. It works with any source node: a media element, a
microphone or a stream.

```bash
npm install realtime-bpm-analyzer
```

```typescript
import { createRealtimeBpmAnalyzer } from 'realtime-bpm-analyzer';

const audioContext = new AudioContext();
const audioElement = document.querySelector('audio')!;
const source = audioContext.createMediaElementSource(audioElement);

const bpmAnalyzer = await createRealtimeBpmAnalyzer(audioContext);

// .input adds the lowpass the default detector expects.
source.connect(bpmAnalyzer.input);
source.connect(audioContext.destination);

bpmAnalyzer.on('bpm', ({ bpm }) => {
  console.log('candidate:', bpm[0]?.tempo);
});
bpmAnalyzer.on('bpmStable', ({ bpm }) => {
  console.log('stable:', bpm[0]?.tempo, 'BPM');
});

audioElement.addEventListener('play', () => audioContext.resume(), { once: true });
```

`bpm` events arrive as the analysis goes, with up to five ranked candidates.
`bpmStable` arrives once the estimate has settled. Each candidate has a
`tempo`, a `count` and a `confidence`; compare confidences with each other
rather than against a fixed cut-off.

The second detector, `tempogram`, reads spectral flux across several bands
rather than amplitude peaks in the bass. Connect the source to `.input` with
either detector:

```typescript
const bpmAnalyzer = await createRealtimeBpmAnalyzer(audioContext, {
  detector: 'tempogram',
});
source.connect(bpmAnalyzer.input);
```

For the microphone, a stream and the events in detail, see
[Detect BPM in real time with JavaScript](/guide/realtime-bpm-detection) and
[Detect BPM from the microphone](/guide/bpm-from-microphone).

## Tempo of a whole file

When the whole file is available, decode it and analyse it in one call.
`analyzeFullBuffer` needs no AudioWorklet and no playback.

```typescript
import { analyzeFullBuffer } from 'realtime-bpm-analyzer';

const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;

input.addEventListener('change', async () => {
  const file = input.files?.[0];
  if (!file) return;

  const audioContext = new AudioContext();
  const audioBuffer = await audioContext.decodeAudioData(await file.arrayBuffer());
  await audioContext.close();

  const tempos = await analyzeFullBuffer(audioBuffer);
  console.log(tempos[0] ? `${tempos[0].tempo} BPM` : 'no clear beat');
});
```

It resolves to up to five candidates, the most voted first, and to an empty
array for silence or audio without a clear pulse. It takes the same `detector`
and `tempoRange` options as the live analyzer. Outside the browser, the
[Node.js entry point](/guide/node) does the same from decoded samples.

## From a tempo to a beat grid

A tempo gives the beat period: at 120 BPM a beat lasts `60 / 120 = 0.5`
seconds. It does not give the phase, so a grid built from the tempo alone has
the right spacing but may sit between the beats. Lining it up needs the time of
one beat, which today has to come from elsewhere: a tap from the user, or an
onset you trust, such as the first kick.

## Limits

- **Tempo, not beat times.** The library reports how fast, not where each beat
  falls.
- **Octaves.** A detector cannot always tell a tempo from its double or half.
  Every tempo is folded into a range, 90 to 180 BPM by default, so an 85 BPM
  track reads 170. Pass `tempoRange: { min: 70, max: 140 }` to read it as 85.
- **One tempo per analysis.** A song that speeds up or changes tempo reports
  candidates for each part; the live analyzer catches up after a while, and
  `bpmAnalyzer.reset()` starts it over.
- **Time to settle.** The default detector waits for 10 seconds of audio
  before `bpmStable`. Very short clips may give no result or a rough one.
- **Rhythm it can hear.** Ambient music, free tempo, rubato and irregular
  meters give low confidence or no result.
- **Browser rules.** An `AudioContext` starts only after a user gesture, and
  the live analyzer needs AudioWorklet (see
  [browser compatibility](/guide/browser-compatibility)).

The analysis runs on the device: the library sends no audio anywhere.

## Next

- [How it works](/guide/how-it-works): the peak detection and interval
  grouping behind the default detector.
- [Getting started](/guide/getting-started): installation and the first
  analyzer.
- [API reference](/api/): every option and event.
