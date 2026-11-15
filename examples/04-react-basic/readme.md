# React File Example

Analyzes an audio or video file offline, with `analyzeFullBuffer`, and shows the reading it returns. A video works the same way, because its sound track is what gets decoded: MP4 with AAC sound and WebM usually work, MOV and MKV depend on the browser and the codec inside, and iPhone `.mov` files don't decode on iOS. The whole file is read into memory, so for a long video, export the sound or a shorter clip. Written in React 19 with hooks.

## What it shows

- A file, or a video's sound track, decoded with `decodeAudioData` and analyzed at once, with no playback.
- The reading: `bpm`, the unrounded `bpmExact`, `confidence` and the `candidates` with their `relation` (`top`, `half`, `double`, `other`), plus the audio span and the engine. It is the same `Reading` the live examples show.
- `null` when the file has no clear tempo, and a plain message when the browser can't decode it.

The code is in `src/components/bpm-analyzer.tsx`, with the panels in `src/components/reading-panel.tsx`. Confidence is shown as the library reports it, from 0 to 1.

## Run it from a clean clone

The example uses the library from this repository, not from npm, so the library is built first. From the repository root:

```bash
npm ci
npm run build -w realtime-bpm-analyzer
npm run dev -w examples/04-react-basic
```

Then open [http://localhost:3004](http://localhost:3004).
