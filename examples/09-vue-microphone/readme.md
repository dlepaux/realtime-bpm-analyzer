# Vue Microphone Example

Analyzes the microphone live, with `createRealtimeBpmAnalyzer`, `liveInput` and a `MediaStreamAudioSourceNode`. Written in Vue 3 with `<script setup>`.

## What it shows

- The microphone opened with the voice filters off, its track passed as `liveInput`, so the analyzer follows the track's clock and reports lost input as `listening` with reason `audio-lost`.
- `analyzer.state`, read at once and then kept current from the events: `listening` (with its reason and `progress`), `settling`, `locked` and `stopped`.
- Each `statechange` as `from → to (reason)`, newest first.
- Each `reading` while settling or locked: `bpm`, `bpmExact`, `confidence` and the `candidates`, the same fields as a file analyzed offline.
- `error` events (a failed analysis step) and a fatal fault, which is a move to `stopped` with the error.
- **Start over** calls `analyzer.reset()`. **Stop** calls `analyzer.stop()`, which is final, and releases the microphone.

The code is in `src/components/bpm-analyzer.vue`, with the panels in `src/components/reading-panel.vue`, `src/components/state-panel.vue` and the `useAnalyzerView` composable in `src/components/use-analyzer-view.ts`. Confidence is shown as the library reports it, from 0 to 1.

## Run it from a clean clone

The example uses the library from this repository, not from npm, so the library is built first. From the repository root:

```bash
npm ci
npm run build -w realtime-bpm-analyzer
npm run dev -w examples/09-vue-microphone
```

Then open [http://localhost:3009](http://localhost:3009).

Allow the microphone when the browser asks. Browsers give the microphone only to `localhost` or HTTPS pages.
