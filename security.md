# Security Policy

## Supported Versions

We provide security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 5.x     | :white_check_mark: |
| < 4.0   | :x:                |
| < 3.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in Realtime BPM Analyzer, please report it privately:

**Email:** [d.lepaux@gmail.com](mailto:d.lepaux@gmail.com)

**Subject:** `[SECURITY] Realtime BPM Analyzer - Brief Description`

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Time

- **Initial response:** Within 48 hours
- **Status update:** Within 7 days
- **Fix timeline:** Depends on severity

## Security Considerations

### Client-Side Processing

The library runs on the user's device, in the browser or in Node.js:

- ✅ The library sends no audio data to external servers
- ✅ The library does no data collection or tracking
- ✅ All of its processing happens locally

This covers the library, not the website that presents it. The website measures its own pages, as [Website Privacy](https://www.realtime-bpm-analyzer.com/website-privacy) describes.

### Microphone Access

When using microphone input:

- Always request user permission explicitly
- Inform users why microphone access is needed
- Audio is processed in real-time and not stored
- No audio data leaves the user's device

### Content Security Policy

If using CSP, ensure it allows:

- `AudioContext` and `AudioWorklet`
- Blob URLs (for worklet loading)

Example CSP:
```
worker-src blob:;
script-src 'self' blob:;
```

## Disclosure Policy

- We follow responsible disclosure practices
- Security issues are addressed promptly
- Credits given to reporters (if desired)
- Public disclosure after fix is released
