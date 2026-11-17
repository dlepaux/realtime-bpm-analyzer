# Realtime BPM Analyzer

[![npm](https://img.shields.io/npm/v/realtime-bpm-analyzer.svg)](https://www.npmjs.com/package/realtime-bpm-analyzer)
[![npm](https://img.shields.io/npm/dm/realtime-bpm-analyzer.svg)](https://www.npmjs.com/package/realtime-bpm-analyzer)
[![install size](https://packagephobia.com/badge?p=realtime-bpm-analyzer)](https://packagephobia.com/result?p=realtime-bpm-analyzer)
[![PyPI](https://img.shields.io/pypi/v/realtime-bpm-analyzer.svg)](https://pypi.org/project/realtime-bpm-analyzer/)
[![Maven Central](https://img.shields.io/maven-central/v/io.github.dlepaux/realtime-bpm-analyzer.svg)](https://central.sonatype.com/artifact/io.github.dlepaux/realtime-bpm-analyzer)
[![Main Pipeline](https://github.com/dlepaux/realtime-bpm-analyzer/actions/workflows/main.yml/badge.svg?branch=main)](https://github.com/dlepaux/realtime-bpm-analyzer/actions/workflows/main.yml)

<div align="center">
  <img src="https://www.realtime-bpm-analyzer.com/realtime-bpm-analyzer-share.png" alt="Realtime BPM Analyzer" width="600">
</div>

<p align="center">
  <strong>Detects the tempo (BPM) of music in the browser, live as it plays or from a whole file, and in Node.js, Python, Java and Kotlin.</strong>
</p>

<p align="center">
  <a href="https://www.realtime-bpm-analyzer.com">📚 Documentation</a> •
  <a href="https://www.realtime-bpm-analyzer.com/examples">🎯 Examples</a> •
  <a href="https://www.realtime-bpm-analyzer.com/guide/getting-started">🚀 Getting Started</a>
</p>

---

## Platforms

<!-- x-release-please-start-version -->

| Platform | Package | Install | Guide |
|----------|---------|---------|-------|
| Browser, live or from a file | [`realtime-bpm-analyzer`](https://www.npmjs.com/package/realtime-bpm-analyzer) | `npm install realtime-bpm-analyzer` | [Getting started](https://www.realtime-bpm-analyzer.com/guide/getting-started) |
| Node.js, Deno and Bun | [`realtime-bpm-analyzer/node`](https://www.npmjs.com/package/realtime-bpm-analyzer) | `npm install realtime-bpm-analyzer` | [Node.js](https://www.realtime-bpm-analyzer.com/guide/node) |
| Python 3.11+ | [`realtime-bpm-analyzer`](https://pypi.org/project/realtime-bpm-analyzer/) | `pip install realtime-bpm-analyzer` | [Python](https://www.realtime-bpm-analyzer.com/guide/python) |
| Java 8+, Kotlin and Android | [`io.github.dlepaux:realtime-bpm-analyzer`](https://central.sonatype.com/artifact/io.github.dlepaux/realtime-bpm-analyzer) | `implementation("io.github.dlepaux:realtime-bpm-analyzer:6.2.0")` | [Java and Kotlin](https://www.realtime-bpm-analyzer.com/guide/java) |

<!-- x-release-please-end -->

The Python and Java ports run the offline analysis on samples you decode. They give the same readings as the JS library, proven by shared [conformance vectors](https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/conformance#readme). Live input from a microphone or a stream is the browser's.

## Features

- **Zero dependencies** - Uses native Web Audio API
- **Real-time analysis** - Analyze audio/video as it plays
- **Two engines, one reading** - The tempogram by default, `engine: 'peaks'` for the 5.x engine
- **Multiple sources** - Works with files, streams, microphone, or any audio/video node
- **Typed events** - Full TypeScript support with autocomplete
- **Runs locally** - The library analyzes audio on the device, makes no network call of its own and collects nothing
- **Any decoded audio** - The library reads decoded audio: in the browser, whatever `decodeAudioData` supports; in Node.js, samples you decode. The [CLI](#command-line) reads MP3, WAV, FLAC, OGG and Opus files, and other formats through ffmpeg

## Installation

```bash
npm install realtime-bpm-analyzer
```

## Quick Example

```typescript
import { createRealtimeBpmAnalyzer } from 'realtime-bpm-analyzer';

// In a click handler: browsers start audio only after a user gesture
const audioContext = new AudioContext();
const analyzer = await createRealtimeBpmAnalyzer(audioContext);

// An <audio> element as the source. Connect it to the analyzer's input, which feeds the engine you picked,
// and to the speakers: a media element source plays only through the nodes it is connected to
const audioElement = document.querySelector('audio')!;
const source = audioContext.createMediaElementSource(audioElement);
source.connect(analyzer.input);
source.connect(audioContext.destination);

// A reading on each analysis step outside listening: twice a second with the default
// tempogram engine, about ten times a second with peaks
analyzer.on('reading', (reading) => {
  console.log('BPM:', reading.bpm, 'state:', analyzer.state.status);
});

// The state moves through listening, settling, locked and stopped
analyzer.on('statechange', ({ to }) => {
  if (to.status === 'locked') {
    console.log('Locked on', to.reading.bpm);
  }
});
```

While locked, keep showing the latest `reading`: the tempo can still move without a `statechange`.

### A whole file

```typescript
import { analyzeFullBuffer } from 'realtime-bpm-analyzer';

// A File from an <input type="file">, or a Blob from fetch(). Call it from a user gesture, such as the input's
// change event, so the AudioContext starts without an autoplay warning
async function bpmOf(file: Blob) {
  const audioContext = new AudioContext();
  const audioBuffer = await audioContext.decodeAudioData(await file.arrayBuffer());
  await audioContext.close(); // the decoded buffer outlives its context
  // The same reading as realtime, or null when no tempo was found
  const reading = await analyzeFullBuffer(audioBuffer);
  return reading?.bpm ?? null;
}
```

### How it works, and its limits

The default engine, the tempogram, measures how the sound changes from moment to moment across several frequency bands, and reads the tempo as the spacing that repeats most in those changes. `engine: 'peaks'`, the 5.x engine, low-passes the audio and counts the intervals between its loudest peaks. Both report the same reading, with a `confidence` that is the chance the reading is right, calibrated on a labelled benchmark from 90 to 180 BPM. Outside that range, or on a custom `tempoRange`, the confidence is `null`: unmeasured.

Every tempo is reported in a range, 90 to 180 BPM by default. A track outside it reads at double or half its tempo: 70 BPM reads 140, and a track at about 180 BPM or faster can read at half. The `candidates` mark the half and double readings, and `tempoRange` moves the range. Music without a steady beat is the hard case: expect a lower confidence, a wrong reading or none. The [benchmark](https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/packages/realtime-bpm-analyzer/benchmark#readme) describes the data, the method and what was measured.

### Strict CSP and browser extensions

The worklet loads from a `blob:` URL by default. Pages whose Content Security Policy blocks `blob:` scripts, and Manifest V3 extensions, serve the published processor file (`realtime-bpm-analyzer/processor`, i.e. `dist/realtime-bpm-processor.js`) from their own origin and pass its URL:

```typescript
const analyzer = await createRealtimeBpmAnalyzer(audioContext, {
  processorUrl: chrome.runtime.getURL('realtime-bpm-processor.js'), // or '/realtime-bpm-processor.js'
});
```

See the [strict CSP guide](https://www.realtime-bpm-analyzer.com/guide/strict-csp) for Vite and extension setups.

### Node.js

`realtime-bpm-analyzer/node` analyzes decoded PCM samples without Web Audio, in Node.js, Bun or Deno, with no added dependency. It returns the same reading as `analyzeFullBuffer` for the same samples, or `null` when it finds no tempo. Decoding is up to you (a WAV reader, ffmpeg, ...):

```typescript
import {analyzeChannelData} from 'realtime-bpm-analyzer/node';

const reading = await analyzeChannelData(channelData, 44100); // Float32Array of one channel
console.log(reading?.bpm, reading?.candidates);
```

See the [Node.js guide](https://www.realtime-bpm-analyzer.com/guide/node).

### Command line

A separate package, [`realtime-bpm-analyzer-cli`](https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/packages/cli#readme), detects the BPM of audio files from a terminal, so this library stays dependency-free:

```bash
npx realtime-bpm-analyzer-cli song.mp3        # 128 BPM, the engine, its confidence and the top candidates
npx realtime-bpm-analyzer-cli --json ./music  # every audio file of a folder, as JSON
```

See the [command-line guide](https://www.realtime-bpm-analyzer.com/guide/cli).

### AI assistants (MCP)

[`realtime-bpm-analyzer-mcp`](https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/packages/mcp#readme) is a local MCP server, so Claude Desktop, Claude Code or any MCP client can detect the BPM of files on your disk. It runs on your machine over stdio: the audio never leaves it.

```bash
claude mcp add bpm -- npx -y realtime-bpm-analyzer-mcp   # Claude Code
```

See the [MCP guide](https://www.realtime-bpm-analyzer.com/guide/mcp) for Claude Desktop and the two tools, `analyze_file` and `analyze_folder`.

## Documentation

**📖 [Full Documentation](https://www.realtime-bpm-analyzer.com)** - Complete guides, API reference, and tutorials

**Key sections:**
- [Getting Started](https://www.realtime-bpm-analyzer.com/guide/getting-started) - Get up and running
- [API Reference](https://www.realtime-bpm-analyzer.com/api) - Complete API documentation
- [Examples](https://www.realtime-bpm-analyzer.com/examples) - Live demos and code samples
- [Migration to v6](https://www.realtime-bpm-analyzer.com/guide/migration-v6) - Upgrading from 5.x
- [Migration to v5](https://www.realtime-bpm-analyzer.com/guide/migration-v5) - Upgrading from v4.x

## Use Cases

- **Audio Players** - Display BPM while playing tracks
- **Live Streams** - Continuous BPM detection from radio/streaming
- **File Analysis** - Whole-file BPM detection from local files
- **Microphone Input** - Real-time analysis from live audio
- **DJ Applications** - Beat matching and tempo detection

## Running Examples Locally

From a clean clone, at the repository root:

```bash
# Install the workspace from the lockfile
npm ci

# Build the library: the examples import it from its dist/ folder
npm run build -w realtime-bpm-analyzer

# Run one example
npm run dev -w examples/01-vanilla-basic
```

Each folder in [`examples/`](examples/readme.md) is one app, in vanilla JavaScript, React or Vue. [`examples/readme.md`](examples/readme.md#running-an-example) gives each example's port, `npm run examples:dev` to start all nine at once, and why the microphone examples need `localhost` or HTTPS.

## Privacy & Security

These points cover the library, the CLI and the MCP server:

- **Local processing** - audio is analyzed on the device and never leaves it
- **No data collection** or transmission - no network call of their own, no telemetry
- **No audio recording** - audio is analyzed, not kept
- **Open source** - fully auditable code

The website that presents them, realtime-bpm-analyzer.com, is a separate thing. Its tools analyze your audio in your browser, and the website measures its own pages with Google Analytics, as [Website Privacy](https://www.realtime-bpm-analyzer.com/website-privacy) describes.

See [privacy.md](privacy.md) and [security.md](security.md) for details.

## Live BPM Detector for Chrome and Edge

Want the tempo without writing code? [Live BPM Detector](https://www.realtime-bpm-analyzer.com/extension/) is a free extension for Chrome and Edge, built on this library. It shows the live tempo of the music playing in the current tab, on YouTube, SoundCloud, Bandcamp and more. Your audio never leaves your device. This extension is independent, and is not affiliated with or endorsed by any of these services.

## Contributing

Contributions are welcome! See [contributing.md](contributing.md) for guidelines.

## License

Apache-2.0 License - See [license.md](license.md) for details.

## Sponsors

If your product depends on this library, consider sponsoring its maintenance via [GitHub Sponsors](https://github.com/sponsors/dlepaux).

## Credits

Inspired by [Tornqvist's bpm-detective](https://github.com/tornqvist/bpm-detective) and [Joe Sullivan's algorithm](https://joesul.li/van/beat-detection-using-web-audio/).

