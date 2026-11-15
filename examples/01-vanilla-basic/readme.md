# Vanilla File Example

Analyzes an audio file offline, with `analyzeFullBuffer`, and shows the reading it returns. Written in vanilla TypeScript, no framework.

## What it shows

- A file decoded with `decodeAudioData` and analyzed at once, with no playback.
- The reading: `bpm`, the unrounded `bpmExact`, `confidence` and the `candidates` with their `relation` (`top`, `half`, `double`, `other`), plus the audio span and the engine. It is the same `Reading` the live examples show.
- `null` when the file has no clear tempo, and a plain message when the browser can't decode it.

The code is in `src/main.ts`, with the panels in `src/reading-panel.ts`. Confidence is shown as the library reports it, from 0 to 1.

## Run it from a clean clone

The example uses the library from this repository, not from npm, so the library is built first. From the repository root:

```bash
npm ci
npm run build -w realtime-bpm-analyzer
npm run dev -w examples/01-vanilla-basic
```

Then open [http://localhost:3001](http://localhost:3001).
