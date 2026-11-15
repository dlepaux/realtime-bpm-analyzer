# Vanilla Media Element Example

Analyzes an audio URL live as it plays, with `createRealtimeBpmAnalyzer` and a `MediaElementAudioSourceNode`. Written in vanilla TypeScript, no framework.

## What it shows

- `analyzer.state`, read at once and then kept current from the events: `listening` (with its reason and `progress`), `settling`, `locked` and `stopped`.
- Each `statechange` as `from → to (reason)`, newest first. Pause the audio and the analyzer moves back to `listening` with reason `pulse-lost`.
- Each `reading` while settling or locked: `bpm`, `bpmExact`, `confidence` and the `candidates`, the same fields as a file analyzed offline.
- `error` events (a failed analysis step) and a fatal fault, which is a move to `stopped` with the error.
- **Start over** calls `analyzer.reset()`: back to `listening` with reason `reset` and the next epoch. **Stop** calls `analyzer.stop()`, which is final.

The code is in `src/main.ts`, with the panels in `src/reading-panel.ts` and `src/state-panel.ts`. Confidence is shown as the library reports it, from 0 to 1.

## Run it from a clean clone

The example uses the library from this repository, not from npm, so the library is built first. From the repository root:

```bash
npm ci
npm run build -w realtime-bpm-analyzer
npm run dev -w examples/02-vanilla-streaming
```

Then open [http://localhost:3002](http://localhost:3002).

The default URL is an internet radio stream. Any audio URL works if its server allows cross-origin requests (CORS), since the analyzer reads the audio.
