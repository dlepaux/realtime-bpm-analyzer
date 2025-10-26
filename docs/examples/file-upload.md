# File Upload BPM Detection

Analyze the BPM of audio files by uploading them to your browser. This example demonstrates synchronous/offline analysis of complete audio files.

## Overview

This approach is ideal for:
- Batch processing multiple audio files
- Analyzing complete songs offline
- Building DJ tools and music libraries
- Processing user-uploaded content

## Features

- ✅ Supports MP3, WAV, FLAC formats
- ✅ Batch processing of multiple files
- ✅ Fast offline analysis
- ✅ Export results to CSV
- ✅ No server upload required (100% client-side)

## Implementation

### Step 1: Read the Audio File

```typescript
async function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string' || reader.result === null) {
        reject(new Error('Could not load the audio file'));
        return;
      }
      resolve(reader.result);
    });
    
    reader.readAsArrayBuffer(file);
  });
}
```

### Step 2: Process the Audio Buffer

```typescript
import { analyzeFullBuffer } from 'realtime-bpm-analyzer';

async function processAudioFile(audioContext: AudioContext, arrayBuffer: ArrayBuffer) {
  // Decode the audio data
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  
  // Analyze BPM
  const tempos = await analyzeFullBuffer(audioBuffer);
  
  return {
    tempos,
    duration: audioBuffer.duration
  };
}
```

### Step 3: Handle File Upload

```typescript
async function handleFileUpload(files: FileList) {
  const audioContext = new AudioContext();
  const results = [];
  
  for (const file of files) {
    // Read the file
    const arrayBuffer = await readAsArrayBuffer(file);
    
    // Process and analyze
    const { tempos, duration } = await processAudioFile(audioContext, arrayBuffer);
    
    results.push({
      name: file.name,
      duration,
      bpm: tempos[0]?.tempo,
      confidence: tempos[0]?.count
    });
  }
  
  return results;
}
```

## Complete Example

```vue
<template>
  <div class="file-upload-analyzer">
    <input
      type="file"
      multiple
      accept="audio/*"
      @change="handleFiles"
      ref="fileInput"
    />
    
    <div v-if="results.length > 0" class="results">
      <h3>Analysis Results</h3>
      <table>
        <thead>
          <tr>
            <th>Filename</th>
            <th>Duration</th>
            <th>BPM</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="result in results" :key="result.name">
            <td>{{ result.name }}</td>
            <td>{{ formatDuration(result.duration) }}</td>
            <td>
              <span v-if="result.isProcessing">Processing...</span>
              <strong v-else>{{ result.bpm }}</strong>
            </td>
          </tr>
        </tbody>
      </table>
      
      <button @click="downloadCSV">Download CSV</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { analyzeFullBuffer } from 'realtime-bpm-analyzer';

const results = ref([]);

async function handleFiles(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;
  
  const audioContext = new AudioContext();
  
  for (const file of files) {
    // Add to results immediately
    const result = {
      name: file.name,
      duration: 0,
      bpm: null,
      isProcessing: true
    };
    results.value.push(result);
    
    try {
      // Read file
      const arrayBuffer = await readFile(file);
      
      // Decode and analyze
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const tempos = await analyzeFullBuffer(audioBuffer);
      
      // Update result
      result.duration = audioBuffer.duration;
      result.bpm = tempos[0]?.tempo;
      result.isProcessing = false;
    } catch (error) {
      console.error('Error analyzing file:', error);
      result.isProcessing = false;
    }
  }
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function downloadCSV() {
  const headers = ['name', 'duration', 'bpm'];
  const rows = results.value.map(r => [
    r.name,
    formatDuration(r.duration),
    r.bpm
  ]);
  
  const csv = [headers, ...rows]
    .map(row => row.join(','))
    .join('\\n');
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bpm-results.csv';
  a.click();
  URL.revokeObjectURL(url);
}
</script>
```

## HTML/JavaScript Version

If you're not using Vue, here's a vanilla JavaScript implementation:

```html
<!DOCTYPE html>
<html>
<head>
  <title>BPM File Analyzer</title>
</head>
<body>
  <input type="file" id="fileInput" multiple accept="audio/*" />
  <div id="results"></div>

  <script type="module">
    import { analyzeFullBuffer } from 'realtime-bpm-analyzer';
    
    document.getElementById('fileInput').addEventListener('change', async (event) => {
      const files = event.target.files;
      const audioContext = new AudioContext();
      const resultsDiv = document.getElementById('results');
      
      for (const file of files) {
        // Read file
        const arrayBuffer = await file.arrayBuffer();
        
        // Decode and analyze
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const tempos = await analyzeFullBuffer(audioBuffer);
        
        // Display result
        const result = document.createElement('div');
        result.textContent = `${file.name}: ${tempos[0].tempo} BPM`;
        resultsDiv.appendChild(result);
      }
    });
  </script>
</body>
</html>
```

## Key Points

::: tip Performance
The analysis is performed entirely in the browser using the Web Audio API. No data is sent to any server, ensuring privacy and fast processing.
:::

::: warning Browser Compatibility
Requires a modern browser with Web Audio API support (Chrome, Firefox, Safari, Edge).
:::

## Next Steps

- [Streaming Audio →](/examples/streaming-audio) - Analyze radio streams in real-time
- [Microphone Input →](/examples/microphone-input) - Detect BPM from your microphone
- [API Reference →](/api/) - Full API documentation
