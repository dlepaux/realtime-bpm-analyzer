# Vue Media Element Example

Analyzes an audio URL live as it plays, with `createRealtimeBpmAnalyzer` and a `MediaElementAudioSourceNode`. Written in Vue 3 with `<script setup>`.

## What it shows

- `analyzer.state`, read at once and then kept current from the events: `listening` (with its reason and `progress`), `settling`, `locked` and `stopped`.
- Each `statechange` as `from → to (reason)`, newest first. When no beat is heard for a couple of seconds, the analyzer moves back to `listening` with reason `pulse-lost`.
- Each `reading` while settling or locked: `bpm`, `bpmExact`, `confidence` and the `candidates`, the same fields as a file analyzed offline.
- `error` events (a failed analysis step) and a fatal fault, which is a move to `stopped` with the error.
- **Start over** calls `analyzer.reset()`: back to `listening` with reason `reset` and the next epoch. **Stop** calls `analyzer.stop()`, which is final.

The code is in `src/components/bpm-analyzer.vue`, with the panels in `src/components/reading-panel.vue`, `src/components/state-panel.vue` and the `useAnalyzerView` composable in `src/components/use-analyzer-view.ts`. Confidence is shown as the library reports it, from 0 to 1.

## The audio it starts on

The URL field starts on `public/click-128.mp3`, a 20-second 128 BPM click track that the page serves
itself, so the example plays from a clean clone with no other server. It is the library's own test
audio (`packages/cli/tests/fixtures/click-128.mp3`, made by `createClickTrack`), under the repo's
Apache-2.0 licence.

To analyse a stream from another site instead, paste its URL. Two things must hold:

- its server sends CORS headers (`Access-Control-Allow-Origin`), or the browser hands the analyzer
  silence;
- the station's terms allow other websites or apps to play it. Many allow personal listening only.

## Run it from a clean clone

The example uses the library from this repository, not from npm, so the library is built first. From the repository root:

```bash
npm ci
npm run build -w realtime-bpm-analyzer
npm run dev -w examples/08-vue-streaming
```

Then open [http://localhost:3008](http://localhost:3008).
