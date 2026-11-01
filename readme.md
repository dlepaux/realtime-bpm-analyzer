# Realtime BPM Analyzer

[![npm](https://img.shields.io/npm/v/realtime-bpm-analyzer.svg)](https://www.npmjs.com/package/realtime-bpm-analyzer)
[![npm](https://img.shields.io/npm/dm/realtime-bpm-analyzer.svg)](https://www.npmjs.com/package/realtime-bpm-analyzer)
[![install size](https://packagephobia.com/badge?p=realtime-bpm-analyzer)](https://packagephobia.com/result?p=realtime-bpm-analyzer)
[![CI Actions Status](https://github.com/dlepaux/realtime-bpm-analyzer/workflows/CI/badge.svg)](https://github.com/dlepaux/realtime-bpm-analyzer/actions)
[![codecov](https://codecov.io/gh/dlepaux/realtime-bpm-analyzer/branch/main/graph/badge.svg)](https://codecov.io/gh/dlepaux/realtime-bpm-analyzer)

<div align="center">
  <img src="https://www.realtime-bpm-analyzer.com/realtime-bpm-analyzer-share.png" alt="Realtime BPM Analyzer" width="600">
</div>

<p align="center">
  <strong>A powerful TypeScript library for detecting beats-per-minute (BPM) in real-time.</strong>
</p>

<p align="center">
  <a href="https://www.realtime-bpm-analyzer.com">📚 Documentation</a> •
  <a href="https://www.realtime-bpm-analyzer.com/examples">🎯 Examples</a> •
  <a href="https://www.realtime-bpm-analyzer.com/guide/getting-started">🚀 Getting Started</a>
</p>

---

## Features

- **Zero dependencies** - Uses native Web Audio API
- **Real-time analysis** - Analyze audio/video as it plays
- **Multiple sources** - Works with files, streams, microphone, or any audio/video node
- **Typed events** - Full TypeScript support with autocomplete
- **Runs locally** - The library analyses audio on the device, makes no network call of its own and collects nothing
- **Supports MP3, FLAC, WAV** formats

## Installation

```bash
npm install realtime-bpm-analyzer
```

## Quick Example

```typescript
import { createRealtimeBpmAnalyzer } from 'realtime-bpm-analyzer';

// Create analyzer
const analyzer = await createRealtimeBpmAnalyzer(audioContext);

// Connect your audio source
audioSource.connect(analyzer.node);

// Listen for BPM detection
analyzer.on('bpm', (data) => {
  console.log('BPM detected:', data.bpm[0].tempo);
});
```

### Strict CSP and browser extensions

The worklet loads from a `blob:` URL by default. Pages whose Content Security Policy blocks `blob:` scripts, and Manifest V3 extensions, serve the published processor file (`realtime-bpm-analyzer/processor`, i.e. `dist/realtime-bpm-processor.js`) from their own origin and pass its URL:

```typescript
const analyzer = await createRealtimeBpmAnalyzer(audioContext, {
  processorUrl: chrome.runtime.getURL('realtime-bpm-processor.js'), // or '/realtime-bpm-processor.js'
});
```

See the [strict CSP guide](https://www.realtime-bpm-analyzer.com/guide/strict-csp) for Vite and extension setups.

### Node.js

`realtime-bpm-analyzer/node` analyses decoded PCM samples without Web Audio, in Node.js, Bun or Deno, with no added dependency. It returns the same candidates as `analyzeFullBuffer` for the same samples. Decoding is up to you (a WAV reader, ffmpeg, ...):

```typescript
import {analyzeChannelData} from 'realtime-bpm-analyzer/node';

const tempos = await analyzeChannelData(channelData, 44100); // Float32Array of one channel
console.log(tempos[0]?.tempo);
```

See the [Node.js guide](https://www.realtime-bpm-analyzer.com/guide/node).

### Command line

A separate package, [`realtime-bpm-analyzer-cli`](https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/packages/cli#readme), detects the BPM of audio files from a terminal, so this library stays dependency-free:

```bash
npx realtime-bpm-analyzer-cli song.mp3        # 128 BPM (confidence 0.46) and the top candidates
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
- [Quick Start Guide](https://www.realtime-bpm-analyzer.com/guide/quick-start) - Get up and running
- [API Reference](https://www.realtime-bpm-analyzer.com/api) - Complete API documentation
- [Examples](https://www.realtime-bpm-analyzer.com/examples) - Live demos and code samples
- [Migration to v5](https://www.realtime-bpm-analyzer.com/guide/migration-v5) - Upgrading from v4.x

## Use Cases

- **Audio Players** - Display BPM while playing tracks
- **Live Streams** - Continuous BPM detection from radio/streaming
- **File Analysis** - Whole-file BPM detection from local files
- **Microphone Input** - Real-time analysis from live audio
- **DJ Applications** - Beat matching and tempo detection

## Running Examples Locally

```bash
# Install dependencies
npm install

# Run a specific example
npm run dev --workspace=examples/01-vanilla-basic

# Available examples:
# - 01-vanilla-basic, 02-vanilla-streaming, 03-vanilla-microphone
# - 04-react-basic, 05-react-streaming, 06-react-microphone  
# - 07-vue-basic, 08-vue-streaming, 09-vue-microphone
```

## Privacy & Security

These points cover the library, the CLI and the MCP server:

- **Local processing** - audio is analysed on the device and never leaves it
- **No data collection** or transmission - no network call of their own, no telemetry
- **No audio recording** - audio is analysed, not kept
- **Open source** - fully auditable code

The website that presents them, realtime-bpm-analyzer.com, is a separate thing. Its tools analyse your audio in your browser, and the website measures its own pages with Google Analytics, as [Website Privacy](https://www.realtime-bpm-analyzer.com/website-privacy) describes.

See [privacy.md](privacy.md) and [security.md](security.md) for details.

## Live BPM Detector for Chrome

Want the tempo without writing code? [Live BPM Detector](https://www.realtime-bpm-analyzer.com/extension/) is a free Chrome extension built on this library. It shows the live tempo of the music playing in the current tab, on YouTube, SoundCloud, Bandcamp and more. Your audio never leaves your device. This extension is independent, and is not affiliated with or endorsed by any of these services.

## Contributing

Contributions are welcome! See [contributing.md](contributing.md) for guidelines.

## License

Apache-2.0 License - See [licence.md](licence.md) for details.

For commercial licensing inquiries, contact: d.lepaux@gmail.com

## Sponsors

If your product depends on this library, consider sponsoring its maintenance via [GitHub Sponsors](https://github.com/sponsors/dlepaux).

## Credits

Inspired by [Tornqvist's bpm-detective](https://github.com/tornqvist/bpm-detective) and [Joe Sullivan's algorithm](http://joesul.li/van/beat-detection-using-web-audio/).

