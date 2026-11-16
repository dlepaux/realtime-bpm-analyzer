# Examples

Nine small apps that use `realtime-bpm-analyzer`: three inputs, each written in vanilla TypeScript, React and Vue. The three versions of an input show the same thing with the same names and layout, so you can compare them side by side.

| Input | Vanilla | React | Vue |
|-------|---------|-------|-----|
| An audio or video file, analyzed at once | [01-vanilla-basic](./01-vanilla-basic/) | [04-react-basic](./04-react-basic/) | [07-vue-basic](./07-vue-basic/) |
| An audio URL, analyzed live as it plays | [02-vanilla-streaming](./02-vanilla-streaming/) | [05-react-streaming](./05-react-streaming/) | [08-vue-streaming](./08-vue-streaming/) |
| The microphone, analyzed live | [03-vanilla-microphone](./03-vanilla-microphone/) | [06-react-microphone](./06-react-microphone/) | [09-vue-microphone](./09-vue-microphone/) |

## What they show

### The reading, in all nine

Every result is a `Reading`, the same type whether it comes from a file or from live audio. The **reading panel** shows all of it:

- `bpm`, the tempo to display, and `bpmExact`, the same tempo unrounded, for timing work;
- `confidence`, from 0 to 1, as the library reports it: its estimate of the chance that `bpm` is right;
- `candidates`, up to five, the reading's own tempo first, each with its `relation` to it: `top`, `half`, `double` or `other`;
- the `audio` span it was measured on, and the `engine` that measured it.

### A file: 01, 04 and 07

`analyzeFullBuffer` analyzes a decoded file at once, with no playback, and returns a reading, or `null` when the file has no clear tempo. A video file works the same way, because `decodeAudioData` decodes its sound track: MP4 with AAC sound and WebM usually work, MOV and MKV depend on the browser and the codec inside, and iPhone `.mov` files don't decode on iOS. The whole file is read into memory, so for a long video, export the sound or a shorter clip. A file the browser can't decode fails at `decodeAudioData`, with a plain message.

### Live audio: 02, 03, 05, 06, 08 and 09

`createRealtimeBpmAnalyzer` analyzes audio as it plays. The **state panel** shows what the analyzer is doing:

- `analyzer.state`, read as soon as the analyzer exists, then kept current from the events. Its `status` is `listening` (with a `reason` and a `progress` toward the first reading), `settling`, `locked` or `stopped`.
- Each `statechange` as `from → to (reason)`, newest first.
- The last `error` event, a failed analysis step the analyzer carries on from. A fatal fault is a move to `stopped` instead, and the panel shows its error.

The reading panel shows each `reading` while the state is `settling` (dimmed) or `locked`. **Start over** calls `analyzer.reset()`, and **Stop** calls `analyzer.stop()`, which is final.

- **An audio URL (02, 05, 08)** goes through a `MediaElementAudioSourceNode`, connected to `analyzer.input` and to the speakers. Each one starts on a bundled 128 BPM click track, so it plays from a clean clone. A stream from another site needs CORS headers, and terms that allow other websites to play it.
- **The microphone (03, 06, 09)** is opened with the voice filters off, and its track goes to the analyzer as `liveInput`. The analyzer then follows the track's clock, and moves to `listening` with reason `audio-lost` while the browser is losing input.

Every live example follows the same pattern:

```typescript
// Read the state at once: a listener added late is never sent the events it missed
console.log(analyzer.state.status);

analyzer.on('statechange', ({ from, to, reason }) => {
  console.log(`${from.status} → ${to.status} (${reason})`);
});

// While listening: how close the analyzer is to its first reading, from 0 to 1
analyzer.on('progress', ({ fraction }) => {
  console.log(`listening, ${Math.round(fraction * 100)}%`);
});

// Inside a listener the state is already current, so it says whether this reading is settling or locked
analyzer.on('reading', (reading) => {
  console.log(analyzer.state.status, reading.bpm, reading.bpmExact, reading.confidence, reading.candidates);
});

analyzer.on('error', ({ name, message }) => {
  console.warn(name, message);
});
```

The microphone examples also list each `kick` as it is heard, with its `contextTime` and `strength`, in a **kick panel** with nothing that flashes:

```typescript
// Each kick drum heard, about 20 to 26 ms after it reached the analyzer: its time on the AudioContext clock, and its
// strength from 0 to 1 against the loudest kick of the last few seconds
analyzer.on('kick', ({ contextTime, strength }) => {
  console.log(contextTime.toFixed(3), strength.toFixed(2));
});
```

A kick is reported as it is heard, never ahead of it, so nothing in these examples lands on a beat to come. How to line a visual up with what the listener hears is in the guide, under [Kick events](https://www.realtime-bpm-analyzer.com/guide/realtime-bpm-detection#kick-events).

## Running an example

The examples use the library from this repository, not from npm, so build it first. From a clean clone, at the repository root:

```bash
npm ci
npm run build -w realtime-bpm-analyzer
npm run dev -w examples/01-vanilla-basic
```

Example `NN` opens on port `30NN`: [http://localhost:3001](http://localhost:3001) for 01, up to [http://localhost:3009](http://localhost:3009) for 09. `npm run examples:dev` starts all nine at once. The microphone examples need `localhost` or HTTPS, as browsers give the microphone to no other page.

`npm run examples:build` type-checks and builds all nine.

## Resource management

- Call `analyzer.stop()` when done: `disconnect()` alone leaves the analysis running, and `stop()` is final, so the next start creates a new analyzer.
- Stop the microphone's tracks, so the browser releases the device.
- Disconnect the audio nodes, and stop on unmount in React and Vue.

## Adding an example

1. Follow the naming convention: `NN-framework-usecase`, with the next port in `vite.config.ts`.
2. Include a readme.md saying what it shows and how to run it.
3. Reuse the panels and `panels.css` of the other examples, so the three frameworks stay alike.
4. Add it to `docs/scripts/build-examples.ts` and `docs/scripts/dev-examples.ts`, and to the docs' examples pages.

## Need help?

- The [documentation](https://www.realtime-bpm-analyzer.com/guide/getting-started)
- The [API reference](https://www.realtime-bpm-analyzer.com/api/)
