# Microphone Input BPM Detection

Detect BPM in real-time using your device's microphone. Perfect for analyzing music playing around you or for live performance tools.

## Overview

This approach is ideal for:
- Detecting BPM of music playing around you
- Building live performance tools
- Creating interactive music applications
- Real-time beat detection for visualizations

## Features

- ✅ Real-time microphone analysis
- ✅ Low latency detection
- ✅ Continuous BPM updates
- ✅ Works with any audio source (music, instruments, etc.)
- ✅ No recording or storage (privacy-friendly)

## Implementation

### Step 1: Request Microphone Access

```typescript
async function getMicrophoneStream(): Promise<MediaStream> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false
    });
    return stream;
  } catch (error) {
    console.error('Microphone access denied:', error);
    throw error;
  }
}
```

### Step 2: Setup Audio Context and Processor

```typescript
import { createRealtimeBpmAnalyzer } from 'realtime-bpm-analyzer';
import type { BpmAnalyzer } from 'realtime-bpm-analyzer';

async function setupMicrophoneAnalysis(stream: MediaStream) {
  const audioContext = new AudioContext();
  await audioContext.resume();
  
  // Create the BPM analyzer (event emitter wrapping AudioWorkletNode)
  const bpmAnalyzer = await createRealtimeBpmAnalyzer(audioContext);
  
  // Create analyzer for visualization (optional)
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  
  // Create source from microphone
  const source = audioContext.createMediaStreamSource(stream);
  
  // Connect the audio graph - use .node for audio connections
  // IMPORTANT: Don't connect to destination to avoid audio feedback
  source.connect(bpmAnalyzer.node);
  source.connect(analyser);
  
  return { audioContext, bpmAnalyzer, source, analyser };
}
```

### Step 3: Listen for BPM Events

```typescript
import type { BpmCandidates } from 'realtime-bpm-analyzer';

function setupBPMListener(bpmAnalyzer: BpmAnalyzer) {
  bpmAnalyzer.on('bpmStable', (data: BpmCandidates) => {
    // Always check array length before accessing
    if (data.bpm.length > 0) {
      console.log('Primary BPM:', data.bpm[0].tempo);
      console.log('Confidence:', data.bpm[0].count);
      
      if (data.bpm.length > 1) {
        console.log('Alternative BPM:', data.bpm[1].tempo);
      }
    }
  });
}
```

### Step 4: Cleanup

```typescript
async function stopAnalysis(
  audioContext: AudioContext,
  source: MediaStreamAudioSourceNode,
  bpmAnalyzer: BpmAnalyzer,
  analyser: AnalyserNode,
  stream: MediaStream
) {
  // Suspend audio context (use suspend instead of close for potential reuse)
  await audioContext.suspend();
  
  // Disconnect nodes
  source.disconnect();
  analyser.disconnect();
  bpmAnalyzer.disconnect();
  
  // Stop microphone
  stream.getTracks().forEach(track => track.stop());
}
```

## Complete React Example

```tsx
'use client';

import { useState } from 'react';
import { createRealtimeBpmAnalyzer } from 'realtime-bpm-analyzer';
import type { BpmAnalyzer, BpmCandidates } from 'realtime-bpm-analyzer';

export default function MicrophoneAnalyzer() {
  const [isRecording, setIsRecording] = useState(false);
  const [currentBpm, setCurrentBpm] = useState<number>(0);
  const [concurrentBpm, setConcurrentBpm] = useState<number>(0);
  const [audioContext, setAudioContext] = useState<AudioContext>();
  const [source, setSource] = useState<MediaStreamAudioSourceNode>();
  const [analyser, setAnalyser] = useState<AnalyserNode>();
  const [bpmAnalyzer, setBpmAnalyzer] = useState<BpmAnalyzer>();

  async function handleStart() {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      });

      // Setup audio context
      const audioCtx = audioContext ?? new AudioContext();
      setAudioContext(audioCtx);
      await audioCtx.resume();

      // Create BPM analyzer
      const bpmAnalyzer = await createRealtimeBpmAnalyzer(audioCtx);
      setBpmAnalyzer(bpmAnalyzer);

      // Create analyzer for visualization
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      setAnalyser(analyser);

      // Create source from microphone
      const mediaStreamSource = audioCtx.createMediaStreamSource(stream);
      setSource(mediaStreamSource);

      // Connect audio graph - use .node for audio connections
      // (no destination connection to avoid feedback)
      mediaStreamSource.connect(bpmAnalyzer.node);
      mediaStreamSource.connect(analyser);

      // Setup event listener
      bpmAnalyzer.on('bpmStable', (data: BpmCandidates) => {
        if (data.bpm.length > 0) {
          setCurrentBpm(data.bpm[0].tempo);
          if (data.bpm.length > 1) {
            setConcurrentBpm(data.bpm[1].tempo);
          }
        }
      });

      setIsRecording(true);
    } catch (error) {
      console.error('Microphone access denied:', error);
      alert('Please grant microphone access to use this feature.');
    }
  }

  async function handleStop() {
    if (!audioContext || !source || !bpmAnalyzer || !analyser) {
      return;
    }

    await audioContext.suspend();

    // Disconnect everything
    source.disconnect();
    analyser.disconnect();
    bpmAnalyzer.disconnect();

    // Reset state
    setCurrentBpm(0);
    setConcurrentBpm(0);
    setIsRecording(false);
  }

  return (
    <div>
      {!isRecording ? (
        <button onClick={handleStart}>
          🎤 Start Microphone Analysis
        </button>
      ) : (
        <button onClick={handleStop}>
          ⏹ Stop
        </button>
      )}

      {isRecording && (
        <div>
          {currentBpm === 0 ? (
            <p>🎵 Listening...</p>
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
<template>
  <div class="microphone-analyzer">
    <div class="controls">
      <button
        v-if="!isRecording"
        @click="startRecording"
        class="start-btn"
      >
        <span class="icon">🎤</span>
        Start Microphone Analysis
      </button>
      
      <button
        v-else
        @click="stopRecording"
        class="stop-btn"
      >
        <span class="icon">⏹</span>
        Stop
      </button>
    </div>
    
    <div v-if="isRecording" class="results">
      <div class="bpm-display">
        <div class="label">Detected BPM</div>
        
        <div v-if="currentBPM === 0" class="listening">
          🎵 Listening...
        </div>
        
        <div v-else class="bpm-container">
          <div class="bpm-value">
            {{ currentBPM }}
            <span class="unit">BPM</span>
          </div>
          <div v-if="alternativeBPM" class="alternative">
            Alternative: {{ alternativeBPM }} BPM
          </div>
        </div>
      </div>
      
      <!-- Optional: Visualizer -->
      <div v-if="analyser" class="visualizer">
        <canvas ref="canvas" width="400" height="100"></canvas>
      </div>
    </div>
    
    <div class="info">
      <h3>How it works</h3>
      <ul>
        <li>Click "Start" and grant microphone access</li>
        <li>Play music near your device or use any audio source</li>
        <li>The algorithm analyzes audio in real-time</li>
        <li>Results update continuously for accurate detection</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, onUnmounted } from 'vue';
import { createRealtimeBpmAnalyzer } from 'realtime-bpm-analyzer';

const isRecording = ref(false);
const currentBPM = ref(0);
const alternativeBPM = ref(0);
const canvas = ref(null);
const analyser = ref(null);

let audioContext = null;
let source = null;
let analyzerNode = null;
let stream = null;
let animationId = null;

async function startRecording() {
  try {
    // Request microphone access
    stream = await navigator.mediaDevices.getUserMedia({ 
      audio: true, 
      video: false 
    });
    
    // Setup audio context
    audioContext = new AudioContext();
    await audioContext.resume();
    
    // Create BPM analyzer
    analyzerNode = await createRealtimeBpmAnalyzer(audioContext, {
      continuousAnalysis: true,
      stabilizationTime: 20000
    });
    
    // Create visualizer analyzer
    const visualAnalyser = audioContext.createAnalyser();
    visualAnalyser.fftSize = 2048;
    analyser.value = visualAnalyser;
    
    // Create source
    source = audioContext.createMediaStreamSource(stream);
    
    // Connect graph - use .node for audio connections
    // (don't connect to destination to avoid feedback)
    source.connect(analyzerNode.node);
    source.connect(visualAnalyser);
    
    // Listen for BPM with typed event listeners
    analyzerNode.on('bpmStable', handleBPMMessage);
    
    isRecording.value = true;
    
    // Start visualizer
    if (canvas.value) {
      visualize();
    }
  } catch (error) {
    console.error('Error starting microphone:', error);
    alert('Could not access microphone. Please grant permission.');
  }
}

function handleBPMMessage(data) {
  const bpms = data.bpm;
  if (bpms.length > 0) {
    currentBPM.value = bpms[0].tempo;
    if (bpms.length > 1) {
        alternativeBPM.value = bpms[1].tempo;
      }
    }
  }
}

async function stopRecording() {
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
  
  if (audioContext) {
    await audioContext.suspend();
  }
  
  if (source) {
    source.disconnect();
  }
  
  if (analyzerNode) {
    analyzerNode.disconnect();
  }
  
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
  
  isRecording.value = false;
  currentBPM.value = 0;
  alternativeBPM.value = 0;
  analyser.value = null;
}

function visualize() {
  if (!canvas.value || !analyser.value) return;
  
  const ctx = canvas.value.getContext('2d');
  const bufferLength = analyser.value.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  
  function draw() {
    animationId = requestAnimationFrame(draw);
    
    analyser.value.getByteTimeDomainData(dataArray);
    
    ctx.fillStyle = 'rgb(245, 245, 245)';
    ctx.fillRect(0, 0, canvas.value.width, canvas.value.height);
    
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgb(100, 108, 255)';
    ctx.beginPath();
    
    const sliceWidth = canvas.value.width / bufferLength;
    let x = 0;
    
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * canvas.value.height) / 2;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      
      x += sliceWidth;
    }
    
    ctx.lineTo(canvas.value.width, canvas.value.height / 2);
    ctx.stroke();
  }
  
  draw();
}

onUnmounted(() => {
  stopRecording();
});
</script>

<style scoped>
.microphone-analyzer {
  max-width: 600px;
  margin: 0 auto;
}

.controls {
  text-align: center;
  margin-bottom: 2rem;
}

.controls button {
  padding: 1rem 2rem;
  font-size: 1.125rem;
  font-weight: 500;
  border: none;
  border-radius: 0.75rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.2s;
}

.start-btn {
  background: linear-gradient(135deg, #646cff 0%, #747bff 100%);
  color: white;
}

.start-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 8px 16px rgba(100, 108, 255, 0.3);
}

.stop-btn {
  background: #ef4444;
  color: white;
}

.icon {
  font-size: 1.5rem;
}

.bpm-display {
  text-align: center;
  padding: 2rem;
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  border-radius: 1rem;
  margin-bottom: 2rem;
}

.label {
  font-size: 0.875rem;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 1rem;
}

.listening {
  font-size: 1.5rem;
  color: #646cff;
  animation: pulse 2s ease-in-out infinite;
}

.bpm-value {
  font-size: 4rem;
  font-weight: bold;
  color: #646cff;
  line-height: 1;
}

.unit {
  font-size: 1.5rem;
  color: #666;
  font-weight: normal;
}

.alternative {
  margin-top: 1rem;
  font-size: 1rem;
  color: #666;
}

.visualizer {
  padding: 1rem;
  background: #f8f9fa;
  border-radius: 0.75rem;
  margin-bottom: 2rem;
}

.visualizer canvas {
  width: 100%;
  height: auto;
  display: block;
}

.info {
  padding: 1.5rem;
  background: #f8f9fa;
  border-radius: 0.75rem;
  border-left: 4px solid #646cff;
}

.info h3 {
  margin-top: 0;
  color: #333;
}

.info ul {
  margin: 1rem 0 0 0;
  padding-left: 1.5rem;
}

.info li {
  color: #666;
  margin-bottom: 0.5rem;
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
  <title>Microphone BPM Analyzer</title>
  <style>
    .bpm-display { font-size: 48px; font-weight: bold; text-align: center; }
    button { padding: 12px 24px; font-size: 16px; cursor: pointer; }
  </style>
</head>
<body>
  <button id="startBtn">Start Microphone Analysis</button>
  <button id="stopBtn" style="display:none">Stop</button>
  
  <div id="bpmDisplay" style="display:none">
    <div class="bpm-display">
      <span id="bpmValue">0</span> BPM
    </div>
    <div id="alternative"></div>
  </div>

  <script type="module">
    import { createRealtimeBpmAnalyzer } from 'realtime-bpm-analyzer';
    
    let audioContext, source, analyzerNode, stream;
    
    document.getElementById('startBtn').addEventListener('click', async () => {
      try {
        // Get microphone
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Setup audio
        audioContext = new AudioContext();
        await audioContext.resume();
        
        analyzerNode = await createRealtimeBpmAnalyzer(audioContext, {
          continuousAnalysis: true
        });
        
        source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        
        // Connect audio graph - use .node for audio connections
        source.connect(analyzerNode.node);
        source.connect(analyser);
        
        // Listen for BPM with typed event listeners
        analyzerNode.on('bpmStable', (data) => {
          const bpms = data.bpm;
          document.getElementById('bpmValue').textContent = bpms[0].tempo;
          if (bpms.length > 1) {
            document.getElementById('alternative').textContent = 
              'Alternative: ' + bpms[1].tempo + ' BPM';
          }
        });
        
        // Update UI
        document.getElementById('startBtn').style.display = 'none';
        document.getElementById('stopBtn').style.display = 'block';
        document.getElementById('bpmDisplay').style.display = 'block';
      } catch (error) {
        alert('Microphone access denied');
      }
    });
    
    document.getElementById('stopBtn').addEventListener('click', async () => {
      await audioContext.suspend();
      source.disconnect();
      analyzerNode.disconnect();
      stream.getTracks().forEach(track => track.stop());
      
      document.getElementById('startBtn').style.display = 'block';
      document.getElementById('stopBtn').style.display = 'none';
      document.getElementById('bpmDisplay').style.display = 'none';
    });
  </script>
</body>
</html>
```

## Browser Permissions

::: warning Microphone Permission
Users must grant microphone permission for this to work. The browser will show a permission prompt on first use.
:::

## Key Points

::: tip No Audio Feedback
The example intentionally doesn't connect the microphone to `audioContext.destination` to avoid audio feedback loops. The audio is only analyzed, not played back.
:::

::: info Stabilization Time
The algorithm needs approximately 10-20 seconds to accurately detect BPM. Initial results may fluctuate before stabilizing.
:::

::: tip Continuous Analysis
The microphone example uses `continuousAnalysis: true` to keep updating the BPM as the music changes.
:::

## Use Cases

- **DJ Tools**: Real-time BPM matching for beat mixing
- **Music Practice**: Detect tempo while practicing instruments
- **Live Performance**: Sync visuals or effects to live music
- **Music Analysis**: Study the tempo of songs playing around you

## Next Steps

- [Streaming Audio →](/examples/streaming-audio) - Analyze online radio streams
- [File Upload →](/examples/file-upload) - Analyze complete audio files
- [API Reference →](/api/) - Full API documentation
