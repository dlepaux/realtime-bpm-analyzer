# Streaming Audio BPM Detection

Analyze the BPM of live audio streams like radio stations or online music services in real-time.

## Overview

This approach is ideal for:
- Monitoring live radio stations
- Analyzing streaming audio services
- Real-time BPM detection from URLs
- Building live audio monitoring tools

## Features

- ✅ Real-time stream analysis
- ✅ Works with HTTP/HTTPS audio streams
- ✅ Continuous BPM updates
- ✅ Low latency detection
- ✅ Supports common streaming formats

## Implementation

### Step 1: Create Audio Element

```typescript
import { createRealtimeBpmAnalyzer, getBiquadFilter } from 'realtime-bpm-analyzer';

// Create audio element for the stream
const audio = new Audio();
audio.src = 'https://stream-url.com/radio.mp3';
audio.crossOrigin = 'anonymous'; // Required for CORS
```

### Step 2: Setup Audio Context and Processor

```typescript
async function setupStreamAnalysis(audioElement: HTMLAudioElement) {
  const audioContext = new AudioContext();
  
  // Create the BPM analyzer (event emitter wrapping AudioWorkletNode)
  const bpmAnalyzer = await createRealtimeBpmAnalyzer(audioContext);
  
  // Create lowpass filter for better beat detection
  const filter = getBiquadFilter(audioContext);
  
  // Create source from audio element
  const source = audioContext.createMediaElementSource(audioElement);
  
  // Connect the audio graph - use .node to connect the AudioWorkletNode
  source.connect(filter);
  filter.connect(bpmAnalyzer.node);
  source.connect(audioContext.destination);
  
  return { audioContext, bpmAnalyzer, source, filter };
}
```

### Step 3: Listen for BPM Events

```typescript
function setupBPMListener(bpmAnalyzer: BpmAnalyzer) {
  // Continuous BPM updates
  bpmAnalyzer.on('bpm', (data) => {
    console.log('Current BPM:', data.bpm[0].tempo);
  });
  
  // Stable BPM detected
  bpmAnalyzer.on('bpmStable', (data) => {
    console.log('Stable BPM:', data.bpm[0].tempo);
    console.log('Confidence:', data.bpm[0].count);
  });
}
```

### Step 4: Start and Stop Analysis

```typescript
async function startAnalysis(audioElement: HTMLAudioElement) {
  const { audioContext, bpmAnalyzer, source, filter } = 
    await setupStreamAnalysis(audioElement);
  
  setupBPMListener(bpmAnalyzer);
  
  // Start playback
  await audioElement.play();
  
  // Return cleanup function
  return async () => {
    await audioContext.suspend();
    source.disconnect();
    filter.disconnect();
    bpmAnalyzer.disconnect();
    audioElement.pause();
  };
}
```

## Complete React/Next.js Example

```tsx
'use client';

import { useRef, useState } from 'react';
import { createRealtimeBpmAnalyzer, getBiquadFilter } from 'realtime-bpm-analyzer';
import type { BpmAnalyzer, BpmCandidates } from 'realtime-bpm-analyzer';

export default function StreamAnalyzer() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [streamUrl, setStreamUrl] = useState('https://ssl1.viastreaming.net:7005/;listen.mp3');
  const [currentBpm, setCurrentBpm] = useState<number>(0);
  const [concurrentBpm, setConcurrentBpm] = useState<number>(0);
  const [audioContext, setAudioContext] = useState<AudioContext>();
  const [source, setSource] = useState<MediaElementAudioSourceNode>();
  const [analyser, setAnalyser] = useState<AnalyserNode>();
  const [biquadFilterNode, setBiquadFilterNode] = useState<BiquadFilterNode>();
  const [bpmAnalyzer, setBpmAnalyzer] = useState<BpmAnalyzer>();
  const audioRef = useRef<HTMLAudioElement>(null);

  async function handleStart() {
    if (!audioRef.current) return;

    setIsAnalyzing(true);

    try {
      const audioCtx = audioContext ?? new AudioContext();
      setAudioContext(audioCtx);
      await audioCtx.resume();

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      setAnalyser(analyser);

      const analyzer = await createRealtimeBpmAnalyzer(audioCtx);
      setBpmAnalyzer(analyzer);

      const filter = getBiquadFilter(audioCtx);
      setBiquadFilterNode(filter);

      const src = source ?? audioCtx.createMediaElementSource(audioRef.current);
      setSource(src);

      // Connect everything together - use .node to connect the AudioWorkletNode
      src.connect(filter).connect(analyzer.node);
      src.connect(analyser);

      // Setup event listeners
      analyzer.on('bpmStable', (data: BpmCandidates) => {
        if (data.bpm.length > 0) {
          setCurrentBpm(data.bpm[0].tempo);
          if (data.bpm.length > 1) {
            setConcurrentBpm(data.bpm[1].tempo);
          }
        }
      });

      analyzer.on('analyzerReset', () => {
        console.log('Analyzer reset - song changed or stream interrupted');
      });

      await audioRef.current.play();
    } catch (error) {
      console.error('Error starting stream analysis:', error);
      setIsAnalyzing(false);
    }
  }

  async function handleStop() {
    if (!audioContext || !source || !bpmAnalyzer || !analyser || !biquadFilterNode) {
      return;
    }

    await audioContext.suspend();

    // Disconnect everything
    source.disconnect();
    analyser.disconnect();
    biquadFilterNode.disconnect();
    bpmAnalyzer.disconnect();

    // Reset state
    setCurrentBpm(0);
    setConcurrentBpm(0);
    setIsAnalyzing(false);

    if (audioRef.current) {
      audioRef.current.pause();
    }
  }

  return (
    <div>
      <div>
        <input
          type="text"
          value={streamUrl}
          onChange={(e) => setStreamUrl(e.target.value)}
          disabled={isAnalyzing}
          placeholder="Enter stream URL"
        />
      </div>

      <audio 
        ref={audioRef} 
        src={streamUrl} 
        crossOrigin="anonymous"
        style={{ display: 'none' }}
      />

      {!isAnalyzing ? (
        <button onClick={handleStart}>
          Start Stream Analysis
        </button>
      ) : (
        <button onClick={handleStop}>
          Stop
        </button>
      )}

      {isAnalyzing && (
        <div>
          {currentBpm === 0 ? (
            <p>Analyzing stream...</p>
          ) : (
            <div>
              <h2>{currentBpm} BPM</h2>
              {concurrentBpm > 0 && <p>Alternative: {concurrentBpm} BPM</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

## Complete Vue Example

```vue
<template>
  <div class="stream-analyzer">
    <div class="controls">
      <input
        v-model="streamUrl"
        type="text"
        placeholder="Enter stream URL..."
        :disabled="isAnalyzing"
      />
      
      <button
        v-if="!isAnalyzing"
        @click="startAnalyzing"
      >
        Start Analysis
      </button>
      
      <button
        v-else
        @click="stopAnalyzing"
        class="stop-btn"
      >
        Stop
      </button>
    </div>
    
    <div v-if="isAnalyzing" class="results">
      <div class="bpm-display">
        <div class="label">Detected BPM</div>
        <div v-if="currentBPM === 0" class="analyzing">
          Analyzing stream...
        </div>
        <div v-else class="bpm-value">
          {{ currentBPM }}
          <span class="unit">BPM</span>
        </div>
        <div v-if="alternativeBPM" class="alternative">
          Alternative: {{ alternativeBPM }} BPM
        </div>
      </div>
    </div>
    
    <audio
      ref="audioElement"
      :src="streamUrl"
      crossorigin="anonymous"
      style="display: none"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { createRealtimeBpmAnalyzer, getBiquadFilter } from 'realtime-bpm-analyzer';

const streamUrl = ref('https://ssl1.viastreaming.net:7005/;listen.mp3');
const isAnalyzing = ref(false);
const currentBPM = ref(0);
const alternativeBPM = ref(0);
const audioElement = ref(null);

let cleanup = null;

async function startAnalyzing() {
  isAnalyzing.value = true;
  currentBPM.value = 0;
  alternativeBPM.value = 0;
  
  try {
    const audio = audioElement.value;
    const audioContext = new AudioContext();
    
    // Create analyzer
    const analyzerNode = await createRealtimeBpmAnalyzer(audioContext);
    const filter = getBiquadFilter(audioContext);
    const source = audioContext.createMediaElementSource(audio);
    
    // Connect graph
    source.connect(filter);
    filter.connect(analyzerNode);
    source.connect(audioContext.destination);
    
    // Listen for BPM with typed event listeners
    analyzerNode.on('bpmStable', (data) => {
      const bpms = data.bpm;
      if (bpms.length > 0) {
        currentBPM.value = bpms[0].tempo;
        if (bpms.length > 1) {
          alternativeBPM.value = bpms[1].tempo;
        }
      }
    });
    
    // Start playback
    await audio.play();
    
    // Store cleanup
    cleanup = async () => {
      await audioContext.suspend();
      source.disconnect();
      filter.disconnect();
      analyzerNode.disconnect();
      audio.pause();
    };
  } catch (error) {
    console.error('Error starting analysis:', error);
    isAnalyzing.value = false;
  }
}

async function stopAnalyzing() {
  if (cleanup) {
    await cleanup();
    cleanup = null;
  }
  isAnalyzing.value = false;
  currentBPM.value = 0;
  alternativeBPM.value = 0;
}
</script>

<style scoped>
.stream-analyzer {
  max-width: 600px;
  margin: 0 auto;
}

.controls {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
}

.controls input {
  flex: 1;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 0.5rem;
}

.controls button {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 0.5rem;
  background: #646cff;
  color: white;
  cursor: pointer;
  font-weight: 500;
}

.controls button.stop-btn {
  background: #ef4444;
}

.bpm-display {
  text-align: center;
  padding: 2rem;
  background: #f8f9fa;
  border-radius: 1rem;
}

.label {
  font-size: 0.875rem;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
}

.analyzing {
  font-size: 1.5rem;
  color: #646cff;
  animation: pulse 2s ease-in-out infinite;
}

.bpm-value {
  font-size: 4rem;
  font-weight: bold;
  color: #646cff;
}

.unit {
  font-size: 1.5rem;
  color: #666;
}

.alternative {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: #666;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>
```

## HTML/JavaScript Version

```html
<!DOCTYPE html>
<html>
<head>
  <title>Stream BPM Analyzer</title>
</head>
<body>
  <div>
    <input id="streamUrl" type="text" placeholder="Stream URL" 
           value="https://ssl1.viastreaming.net:7005/;listen.mp3" />
    <button id="startBtn">Start Analysis</button>
    <button id="stopBtn" style="display:none">Stop</button>
  </div>
  
  <div id="bpmDisplay" style="display:none">
    <h2 id="bpmValue">0 BPM</h2>
    <p id="alternative"></p>
  </div>
  
  <audio id="audio" crossorigin="anonymous" style="display:none"></audio>

  <script type="module">
    import { createRealtimeBpmAnalyzer, getBiquadFilter } from 'realtime-bpm-analyzer';
    
    let cleanup = null;
    
    document.getElementById('startBtn').addEventListener('click', async () => {
      const streamUrl = document.getElementById('streamUrl').value;
      const audio = document.getElementById('audio');
      audio.src = streamUrl;
      
      const audioContext = new AudioContext();
      const analyzerNode = await createRealtimeBpmAnalyzer(audioContext);
      const filter = getBiquadFilter(audioContext);
      const source = audioContext.createMediaElementSource(audio);
      
      source.connect(filter).connect(analyzerNode);
      source.connect(audioContext.destination);
      
      // Use typed event listeners
      analyzerNode.on('bpmStable', (data) => {
        const bpms = data.bpm;
        document.getElementById('bpmValue').textContent = bpms[0].tempo + ' BPM';
        if (bpms.length > 1) {
          document.getElementById('alternative').textContent = 
            'Alternative: ' + bpms[1].tempo + ' BPM';
        }
      });
      
      await audio.play();
      
      document.getElementById('startBtn').style.display = 'none';
      document.getElementById('stopBtn').style.display = 'block';
      document.getElementById('bpmDisplay').style.display = 'block';
      
      cleanup = async () => {
        await audioContext.suspend();
        source.disconnect();
        filter.disconnect();
        analyzerNode.disconnect();
        audio.pause();
      };
    });
    
    document.getElementById('stopBtn').addEventListener('click', async () => {
      if (cleanup) {
        await cleanup();
        cleanup = null;
      }
      document.getElementById('startBtn').style.display = 'block';
      document.getElementById('stopBtn').style.display = 'none';
      document.getElementById('bpmDisplay').style.display = 'none';
    });
  </script>
</body>
</html>
```

## CORS Considerations

::: warning CORS Headers
Audio streams must have proper CORS headers set. If you control the stream server, ensure it returns:
```
Access-Control-Allow-Origin: *
```

Not all public streams support CORS. Test with streams you control or known CORS-enabled streams.
:::

## Example Streams

Here are some test streams (availability may vary):

```typescript
const testStreams = [
  'https://stream.techno.fm/radio1.mp3',
  // Add your own streams here
];
```

## Key Points

::: tip Stabilization Time
The algorithm needs approximately 10-20 seconds of audio to accurately detect BPM. Be patient when analyzing new streams.
:::

::: info Continuous Updates
By default, the analyzer stops after detecting a stable BPM. Set `continuousAnalysis: true` in the options to keep analyzing:

```typescript
const analyzerNode = await createRealtimeBpmAnalyzer(audioContext, {
  continuousAnalysis: true
});
```
:::

## Next Steps

- [Microphone Input →](/examples/microphone-input) - Analyze audio from your microphone
- [File Upload →](/examples/file-upload) - Analyze complete audio files
- [API Reference →](/api/) - Full API documentation
