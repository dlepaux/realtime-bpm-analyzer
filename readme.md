# Realtime BPM Analyzer

[![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/xojs/xo)
[![npm](https://img.shields.io/npm/dm/realtime-bpm-analyzer.svg)](https://www.npmjs.com/package/realtime-bpm-analyzer)
[![npm](https://img.shields.io/npm/v/realtime-bpm-analyzer.svg)](https://www.npmjs.com/package/realtime-bpm-analyzer)
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
  <a href="https://www.realtime-bpm-analyzer.com/guide/quick-start">🚀 Quick Start</a>
</p>

---

## Features

- **Zero dependencies** - Uses native Web Audio API
- **Real-time analysis** - Analyze audio/video as it plays
- **Multiple sources** - Works with files, streams, microphone, or any audio node
- **Typed events** - Full TypeScript support with autocomplete
- **Client-side only** - 100% privacy-focused, no data collection
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
- **File Analysis** - Offline BPM detection from uploaded files
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

- **100% client-side** processing
- **No data collection** or transmission
- **No audio recording** - real-time analysis only
- **Open source** - fully auditable code

See [privacy.md](privacy.md) and [security.md](security.md) for details.

## Contributing

Contributions are welcome! See [contributing.md](contributing.md) for guidelines.

## License

Apache-2.0 License - See [licence.md](licence.md) for details.

For commercial licensing inquiries, contact: d.lepaux@gmail.com

## Credits

Inspired by [Tornqvist's bpm-detective](https://github.com/tornqvist/bpm-detective) and [Joe Sullivan's algorithm](http://joesul.li/van/beat-detection-using-web-audio/).

