# Basic Usage

This guide demonstrates the most common usage patterns for Realtime BPM Analyzer.

## Simple Audio Player Analysis

The most straightforward use case - analyzing an HTML audio element:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>BPM Analyzer - Basic Example</title>
  <style>
    body {
      font-family: system-ui, sans-serif;
      max-width: 600px;
      margin: 50px auto;
      padding: 20px;
    }
    .bpm-display {
      font-size: 48px;
      font-weight: bold;
      color: #646cff;
      margin: 20px 0;
    }
    .status {
      color: #666;
      font-size: 14px;
    }
    audio {
      width: 100%;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <h1>BPM Analyzer</h1>
  
  <audio id="audioPlayer" controls>
    <source src="your-song.mp3" type="audio/mpeg">
    Your browser does not support the audio element.
  </audio>
  
  <div class="bpm-display" id="bpmDisplay">-- BPM</div>
  <div class="status" id="status">Press play to analyze</div>
  
  <script type="module">
    import { createRealTimeBpmProcessor, getBiquadFilter } from 'https://cdn.jsdelivr.net/npm/realtime-bpm-analyzer/+esm';
    
    let audioContext;
    let isSetup = false;
    
    const audioPlayer = document.getElementById('audioPlayer');
    const bpmDisplay = document.getElementById('bpmDisplay');
    const statusDisplay = document.getElementById('status');
    
    audioPlayer.addEventListener('play', async () => {
      if (!isSetup) {
        await setupAnalyzer();
        isSetup = true;
      }
    });
    
    async function setupAnalyzer() {
      try {
        // Create audio context
        audioContext = new AudioContext();
        
        // Create BPM analyzer
        const realtimeAnalyzerNode = await createRealTimeBpmProcessor(audioContext);
        
        // Create audio source
        const source = audioContext.createMediaElementSource(audioPlayer);
        
        // Create low-pass filter
        const lowpass = getBiquadFilter(audioContext);
        
        // Connect audio graph
        source.connect(lowpass);
        lowpass.connect(realtimeAnalyzerNode);
        source.connect(audioContext.destination);
        
        // Listen for BPM events with typed listeners
        realtimeAnalyzerNode.on('bpm', (data) => {
          updateBPMDisplay(data.bpm, false);
        });
        
        realtimeAnalyzerNode.on('bpmStable', (data) => {
          updateBPMDisplay(data.bpm, true);
        });
        
        statusDisplay.textContent = 'Analyzing...';
        
      } catch (error) {
        console.error('Error setting up BPM analyzer:', error);
        statusDisplay.textContent = 'Error: ' + error.message;
      }
    }
    
    function updateBPMDisplay(bpmCandidates, isStable) {
      if (bpmCandidates && bpmCandidates.length > 0) {
        const topBPM = bpmCandidates[0].tempo;
        const confidence = bpmCandidates[0].count;
        
        bpmDisplay.textContent = `${topBPM} BPM`;
        bpmDisplay.style.color = isStable ? '#10b981' : '#f59e0b';
        
        statusDisplay.textContent = isStable 
          ? `✓ Stable detection (confidence: ${confidence})`
          : `Analyzing... (confidence: ${confidence})`;
      }
    }
  </script>
</body>
</html>
```

## Module-Based Implementation

For modern build setups (Vite, Webpack, etc.):

```javascript
// analyzer.js
import { createRealTimeBpmProcessor, getBiquadFilter } from 'realtime-bpm-analyzer';

export class BPMAnalyzer {
  constructor(audioElement) {
    this.audioElement = audioElement;
    this.audioContext = null;
    this.analyzerNode = null;
    this.onBPMUpdate = null;
    this.onStableBPM = null;
  }
  
  async initialize() {
    // Create audio context
    this.audioContext = new AudioContext();
    
    // Create analyzer
    this.analyzerNode = await createRealTimeBpmProcessor(this.audioContext);
    
    // Create source
    const source = this.audioContext.createMediaElementSource(this.audioElement);
    
    // Create filter
    const lowpass = getBiquadFilter(this.audioContext);
    
    // Connect nodes
    source.connect(lowpass);
    lowpass.connect(this.analyzerNode);
    source.connect(this.audioContext.destination);
    
    // Handle BPM events with typed listeners
    this.analyzerNode.on('bpm', (data) => {
      if (this.onBPMUpdate) {
        this.onBPMUpdate(data.bpm);
      }
    });
    
    this.analyzerNode.on('bpmStable', (data) => {
      if (this.onStableBPM) {
        this.onStableBPM(data.bpm);
      }
    });
  }
  
  function destroy() {
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}

// Usage:
const analyzer = new BPMAnalyzer(audioElement);
await analyzer.initialize();

analyzer.onBPMUpdate = (candidates) => {
  console.log('BPM update:', candidates);
};

analyzer.onStableBPM = (candidates) => {
  console.log('Stable BPM:', candidates[0].tempo);
};
```

## Displaying Multiple Candidates

Show the top BPM candidates with confidence scores:

```javascript
function displayBPMCandidates(candidates) {
  const container = document.getElementById('candidates');
  container.innerHTML = '';
  
  // Show top 3 candidates
  candidates.slice(0, 3).forEach((candidate, index) => {
    const div = document.createElement('div');
    div.className = index === 0 ? 'candidate primary' : 'candidate';
    div.innerHTML = `
      <span class="tempo">${candidate.tempo} BPM</span>
      <span class="confidence">Confidence: ${candidate.count}</span>
    `;
    container.appendChild(div);
  });
}
```

```css
.candidate {
  display: flex;
  justify-content: space-between;
  padding: 10px;
  margin: 5px 0;
  border-radius: 4px;
  background: #f3f4f6;
}

.candidate.primary {
  background: #e0e7ff;
  border: 2px solid #6366f1;
  font-weight: bold;
}

.tempo {
  font-size: 18px;
}

.confidence {
  color: #666;
  font-size: 14px;
}
```

## Error Handling

Always handle potential errors:

```javascript
async function setupWithErrorHandling() {
  try {
    // Check browser support
    if (!window.AudioContext) {
      throw new Error('Web Audio API not supported');
    }
    
    const audioContext = new AudioContext();
    const realtimeAnalyzerNode = await createRealTimeBpmProcessor(audioContext);
    
    // ... rest of setup
    
  } catch (error) {
    if (error.name === 'NotAllowedError') {
      console.error('Microphone access denied');
    } else if (error.name === 'NotSupportedError') {
      console.error('Audio format not supported');
    } else {
      console.error('Setup failed:', error);
    }
    
    // Show user-friendly message
    showErrorMessage(error.message);
  }
}
```

## Performance Optimization

For better performance in production:

```javascript
// Debounce BPM updates
function debounceBPMUpdate(callback, delay = 100) {
  let timeoutId;
  return (bpm) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => callback(bpm), delay);
  };
}

const updateUI = debounceBPMUpdate((bpm) => {
  document.getElementById('bpm').textContent = `${bpm[0].tempo} BPM`;
}, 100);

realtimeAnalyzerNode.on('bpm', (data) => {
  updateUI(data.bpm);
});
```

## Next Steps

Check out more specific examples:

- [Microphone Input](/examples/microphone-input)
- [File Upload](/examples/file-upload)
- [Streaming Audio](/examples/streaming-audio)
- [Next.js Integration](/examples/nextjs)
- [React Integration](/examples/react)
