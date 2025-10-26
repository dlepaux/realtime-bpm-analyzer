# Browser Compatibility

Realtime BPM Analyzer works in all modern browsers that support the Web Audio API and AudioWorklet.

## Browser Support Matrix

| Browser | Minimum Version | AudioWorklet | Status |
|---------|----------------|--------------|--------|
| **Chrome** | 66+ | ✅ | Fully Supported |
| **Edge** | 79+ | ✅ | Fully Supported |
| **Firefox** | 76+ | ✅ | Fully Supported |
| **Safari** | 14.1+ | ✅ | Fully Supported |
| **Opera** | 53+ | ✅ | Fully Supported |
| **Chrome Android** | 66+ | ✅ | Fully Supported |
| **Safari iOS** | 14.5+ | ✅ | Fully Supported |
| **Samsung Internet** | 9.0+ | ✅ | Fully Supported |

### Legacy Browser Support

For older browsers (pre-2019), AudioWorklet is not available. The library **requires** AudioWorklet and will not work with older ScriptProcessorNode-based fallbacks.

**Minimum Requirements:**
- AudioWorklet API support
- Web Audio API support
- ES2015+ JavaScript support

## Feature Detection

Always check for AudioWorklet support before initializing:

```typescript
function isSupported() {
  return !!(
    window.AudioContext && 
    AudioContext.prototype.audioWorklet
  );
}

if (isSupported()) {
  // Safe to use the library
  const audioContext = new AudioContext();
  const analyzer = await createRealTimeBpmProcessor(audioContext);
} else {
  // Show error message
  alert('Your browser does not support BPM analysis. Please update your browser.');
}
```

## Platform-Specific Notes

### Chrome / Chromium

✅ **Best Performance**
- Excellent AudioWorklet implementation
- Lowest latency
- Best mobile support

**Notes:**
- Requires HTTPS or localhost for AudioContext
- May show autoplay warnings (expected)

### Firefox

✅ **Excellent Support**
- Reliable AudioWorklet implementation
- Good performance

**Notes:**
- Slightly higher latency than Chrome
- May require user gesture on first AudioContext creation

### Safari (macOS & iOS)

✅ **Fully Supported** (14.1+)

**Important Considerations:**

1. **User Gesture Required**
   ```typescript
   // Always create AudioContext after user interaction
   button.addEventListener('click', async () => {
     const audioContext = new AudioContext();
     await audioContext.resume(); // Critical for iOS!
     // ... continue setup
   });
   ```

2. **Background Suspension**
   ```typescript
   // Safari suspends AudioContext when page is hidden
   document.addEventListener('visibilitychange', () => {
     if (document.hidden) {
       audioContext.suspend();
     } else {
       audioContext.resume();
     }
   });
   ```

3. **File Size Limits**
   - iOS Safari has memory limits for audio decoding
   - Large files (>50MB) may fail
   - Recommend limiting file uploads to <30MB

4. **Stream Support**
   - Works well with streaming audio
   - CORS requirements are strict
   - Test thoroughly with your stream sources

### Edge (Chromium-based)

✅ **Excellent Support** (79+)
- Same engine as Chrome
- Identical performance and compatibility

**Note:** Legacy Edge (<79) is **not supported**.

### Mobile Browsers

#### Android Chrome
✅ **Excellent Support**
- Full feature parity with desktop Chrome
- Good battery efficiency
- Reliable AudioWorklet

**Tips:**
- Test battery impact on target devices
- Use `continuousAnalysis` for streams to manage memory

#### iOS Safari
✅ **Good Support** (14.5+)

**Limitations:**
- Background audio pauses when app is backgrounded
- Stricter memory limits than desktop
- Requires user gesture for AudioContext

**Best Practices:**
```typescript
// iOS-specific initialization
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

// Always resume after user interaction
await audioContext.resume();

// Check state
if (audioContext.state === 'suspended') {
  await audioContext.resume();
}
```

## Audio Format Support

The library works with any format supported by the browser's audio decoder:

| Format | Chrome | Firefox | Safari | Edge |
|--------|--------|---------|--------|------|
| **MP3** | ✅ | ✅ | ✅ | ✅ |
| **WAV** | ✅ | ✅ | ✅ | ✅ |
| **FLAC** | ✅ | ✅ | ✅ | ✅ |
| **OGG** | ✅ | ✅ | ❌ | ✅ |
| **AAC** | ✅ | ❌* | ✅ | ✅ |
| **WebM** | ✅ | ✅ | ❌ | ✅ |

*Firefox supports AAC in MP4 containers

### File Analysis Support

```typescript
import { analyzeFullBuffer } from 'realtime-bpm-analyzer';

async function analyzeFile(file) {
  const audioContext = new AudioContext();
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const bpm = await analyzeFullBuffer(audioBuffer);
    return bpm;
  } catch (error) {
    if (error.name === 'EncodingError') {
      throw new Error('Unsupported audio format');
    }
    throw error;
  } finally {
    await audioContext.close();
  }
}
```

## HTTPS Requirements

Most browsers require **HTTPS** for:
- Microphone access (`getUserMedia`)
- AudioContext creation (in some contexts)

**Exceptions:**
- `localhost` (always allowed)
- `127.0.0.1` (always allowed)

## CORS Considerations

When analyzing external audio sources (streams, remote files):

```typescript
// Add crossorigin attribute to audio element
const audio = document.createElement('audio');
audio.crossOrigin = 'anonymous';
audio.src = 'https://example.com/stream.mp3';
```

### CORS Headers Required

Server must send:
```
Access-Control-Allow-Origin: *
```
or
```
Access-Control-Allow-Origin: https://your-domain.com
```

Without proper CORS headers, you'll get:
```
DOMException: Failed to construct 'AudioContext': 
The provided value is not of type 'AudioNode'
```

## Security Restrictions

### Autoplay Policies

Most browsers block autoplay of audio with sound:

```typescript
// Wait for user interaction
button.addEventListener('click', async () => {
  const audioContext = new AudioContext();
  await audioContext.resume(); // May be required
  
  const audio = document.getElementById('track');
  await audio.play(); // Now allowed
});
```

### Private/Incognito Mode

Some browsers limit features in private mode:
- Reduced memory limits
- Stricter autoplay policies
- Limited storage access

The library works, but test your implementation in private mode.

## Progressive Web Apps (PWA)

✅ **Fully Compatible**

The library works great in PWAs:
- Offline analysis (service workers)
- Background processing
- Install prompts supported

**Manifest Requirements:**
```json
{
  "name": "BPM Analyzer",
  "display": "standalone",
  "start_url": "/",
  "scope": "/"
}
```

## Testing Browser Support

Use this snippet to test compatibility:

```typescript
function checkBrowserSupport() {
  const report = {
    audioContext: !!window.AudioContext,
    audioWorklet: !!(window.AudioContext && AudioContext.prototype.audioWorklet),
    mediaDevices: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    webAudio: !!(window.AudioContext || window.webkitAudioContext),
  };
  
  console.table(report);
  
  const isCompatible = report.audioContext && report.audioWorklet;
  
  return {
    compatible: isCompatible,
    features: report
  };
}

// Usage
const support = checkBrowserSupport();

if (support.compatible) {
  console.log('✅ Browser is fully compatible');
} else {
  console.error('❌ Browser is not compatible');
  console.log('Missing features:', 
    Object.entries(support.features)
      .filter(([key, value]) => !value)
      .map(([key]) => key)
  );
}
```

## Known Issues

### Safari 14.0 and Below

- AudioWorklet not supported
- Library will not work
- **Solution:** Update to Safari 14.1+

### Firefox Private Browsing

- Reduced memory limits
- May fail on large files (>30MB)
- **Solution:** Use smaller files or regular browsing mode

### Android WebView

- Support varies by Android version
- Chrome WebView 66+ should work
- Test thoroughly on target devices

### iOS WKWebView

- Same requirements as Safari (14.5+)
- User gesture required
- **Solution:** Ensure AudioContext creation after user interaction

## Browser Update Recommendations

Recommend users upgrade if using:
- Chrome < 66
- Firefox < 76
- Safari < 14.1
- Edge < 79

Display a friendly message:

```typescript
const minVersions = {
  chrome: 66,
  firefox: 76,
  safari: 14.1,
  edge: 79
};

function showUpdateMessage() {
  const message = `
    Your browser does not support BPM analysis.
    Please update to:
    - Chrome 66+
    - Firefox 76+
    - Safari 14.1+
    - Edge 79+
  `;
  
  alert(message);
}
```

## Debugging Browser Issues

### Check AudioContext State

```typescript
console.log('AudioContext state:', audioContext.state);
// Should be: 'running'
// If 'suspended': call audioContext.resume()
// If 'closed': create new AudioContext
```

### Check AudioWorklet Support

```typescript
if (!audioContext.audioWorklet) {
  console.error('AudioWorklet not supported');
}
```

### Check Console for Errors

Common errors:
- `NotAllowedError`: Need user gesture
- `EncodingError`: Unsupported audio format
- `CORS error`: Check crossorigin headers

## Performance by Browser

Relative performance (1x = baseline):

| Browser | Desktop | Mobile |
|---------|---------|--------|
| Chrome | 1.0x | 1.0x |
| Firefox | 0.95x | 0.90x |
| Safari | 0.90x | 0.85x |
| Edge | 1.0x | N/A |

*Lower is slower, but all are acceptable for real-time analysis*

## Next Steps

- [Performance Tips](/guide/performance) - Optimize for your platform
- [How It Works](/guide/how-it-works) - Technical details
- [Getting Started](/guide/getting-started) - Installation and setup
