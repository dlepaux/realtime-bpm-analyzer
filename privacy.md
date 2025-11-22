# Privacy Policy

## Overview

Realtime BPM Analyzer is designed with privacy as a core principle. All audio processing happens entirely in your browser using the Web Audio API.

## Data Processing

### What We Process

- **Audio signals** - Analyzed in real-time to detect tempo/BPM
- **Peak detection data** - Temporary calculations for beat identification
- **BPM candidates** - Results of the analysis algorithm

### What We DON'T Collect or Store

- ❌ No audio recording or storage
- ❌ No data sent to external servers
- ❌ No telemetry or analytics
- ❌ No cookies or tracking
- ❌ No user information
- ❌ No third-party data sharing

## How It Works

### Client-Side Processing

All audio analysis happens **locally in your browser**:

1. Audio data flows through the Web Audio API
2. Analysis runs in an AudioWorklet (separate thread)
3. Results are returned to your application
4. No data leaves your device

### Memory Management

- Audio data is processed in small chunks
- Temporary buffers are cleared after analysis
- No persistent storage of audio information
- Memory is automatically managed by the browser

## Microphone Usage

When using microphone input:

### Permission

- Requires explicit browser permission via `getUserMedia`
- You control when to request access
- Users can deny or revoke permission at any time

### Processing

- Audio is analyzed in real-time only
- No recording or saving of microphone input
- Processing stops when you stop the analyzer
- Audio stream is released when disconnected

### Best Practices

**For Developers:**
- Always explain why microphone access is needed before requesting
- Provide clear visual indicators when microphone is active
- Stop the audio stream when done: `stream.getTracks().forEach(track => track.stop())`
- Handle permission denial gracefully

**For Users:**
- The library never records your audio
- Check for visual indicators (browser shows mic icon when active)
- You can revoke permissions anytime in browser settings

## Audio Files

When analyzing audio files:

- Files are decoded in browser memory
- Processing happens entirely client-side
- No files are uploaded to any server
- Analyzed data is temporary and not stored

## Third-Party Content

### No External Dependencies

- This library has **zero runtime dependencies**
- No third-party code runs during audio processing
- No external APIs are called

### Remote Audio Streams

If you analyze remote audio (URLs, streams):

- Audio is fetched directly by your browser
- Subject to CORS policies (server must allow it)
- We don't intercept or proxy the audio
- Privacy depends on the audio source provider

## Compliance

### GDPR & Privacy Laws

- No personal data is processed by this library
- No consent mechanisms needed (no data collection)
- No data retention (nothing is stored)
- No data processing agreements needed

### Your Responsibility

As a developer using this library, you are responsible for:

- Informing your users about your app's audio processing
- Complying with applicable privacy laws in your jurisdiction
- Managing permissions and user consent for your application
- Implementing your own privacy policy if needed

## Transparency

### Open Source

- All code is publicly available on [GitHub](https://github.com/dlepaux/realtime-bpm-analyzer)
- Fully auditable implementation
- Community-reviewed and maintained

### Audit Trail

You can verify our privacy claims by:

- Reviewing the source code
- Checking network activity (no requests are made)
- Inspecting browser memory (no persistent storage)
- Using browser developer tools to monitor behavior

## Questions

If you have privacy concerns or questions:

- Open an issue on [GitHub](https://github.com/dlepaux/realtime-bpm-analyzer/issues)
- Email: [d.lepaux@gmail.com](mailto:d.lepaux@gmail.com)

---

**Last updated:** November 2025
