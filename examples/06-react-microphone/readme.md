# React Microphone Example

Analyzes the microphone live, with `createRealtimeBpmAnalyzer`, `liveInput` and a `MediaStreamAudioSourceNode`. Written in React 19 with hooks.

## What it shows

- The microphone opened with the voice filters off, its track passed as `liveInput`, so the analyzer follows the track's clock and reports lost input as `listening` with reason `audio-lost`.
- `analyzer.state`, read at once and then kept current from the events: `listening` (with its reason and `progress`), `settling`, `locked` and `stopped`.
- Each `statechange` as `from → to (reason)`, newest first.
- Each `reading` while settling or locked: `bpm`, `bpmExact`, `confidence` and the `candidates`, the same fields as a file analyzed offline.
- `error` events (a failed analysis step) and a fatal fault, which is a move to `stopped` with the error.
- Each `kick` as it is heard, newest first: its `contextTime` on the AudioContext clock and its `strength`, from 0 to 1, with a count of the kicks heard. The panel lists the newest eight, with nothing that flashes.
- **Start over** calls `analyzer.reset()`. **Stop** calls `analyzer.stop()`, which is final, and releases the microphone.

The code is in `src/components/bpm-analyzer.tsx`, with the panels in `src/components/reading-panel.tsx`, `src/components/state-panel.tsx`, `src/components/kick-panel.tsx` and the `useAnalyzerView` hook in `src/components/use-analyzer-view.ts`. Confidence is shown as the library reports it, from 0 to 1, or as unmeasured when it is null.

## Run it from a clean clone

The example uses the library from this repository, not from npm, so the library is built first. From the repository root:

```bash
npm ci
npm run build -w realtime-bpm-analyzer
npm run dev -w examples/06-react-microphone
```

Then open [http://localhost:3006](http://localhost:3006).

Allow the microphone when the browser asks. Browsers give the microphone only to `localhost` or HTTPS pages.
