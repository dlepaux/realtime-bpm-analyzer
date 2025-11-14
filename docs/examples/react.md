# React Integration

How to integrate Realtime BPM Analyzer in React applications.

## Installation

```bash
npm install realtime-bpm-analyzer
```

## Inline Implementation Pattern (Recommended)

For better control and flexibility, implement the analyzer directly in your component:

```tsx
'use client'; // Required for Next.js App Router

import { useState } from 'react';
import { createRealTimeBpmProcessor, getBiquadFilter } from 'realtime-bpm-analyzer';
import type { BpmAnalyzer, BpmCandidates } from 'realtime-bpm-analyzer';

export default function BPMAnalyzer() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentBpm, setCurrentBpm] = useState<number>(0);
  const [concurrentBpm, setConcurrentBpm] = useState<number>(0);
  const [audioContext, setAudioContext] = useState<AudioContext>();
  const [source, setSource] = useState<MediaElementAudioSourceNode>();
  const [analyser, setAnalyser] = useState<AnalyserNode>();
  const [realtimeAnalyzerNode, setRealtimeAnalyzerNode] = useState<BpmAnalyzer>();
  const [biquadFilterNode, setBiquadFilterNode] = useState<BiquadFilterNode>();

  async function startAnalysis(audioElement: HTMLAudioElement) {
    try {
      // Reuse or create audio context
      const audioCtx = audioContext ?? new AudioContext();
      setAudioContext(audioCtx);
      await audioCtx.resume();

      // Create analyzer nodes
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      setAnalyser(analyser);

      const bpmAnalyzer = await createRealTimeBpmProcessor(audioCtx);
      setRealtimeAnalyzerNode(bpmAnalyzer);

      // Optional: Add filtering for better accuracy
      const filter = getBiquadFilter(audioCtx);
      setBiquadFilterNode(filter);

      // Create source (reuse if exists to avoid errors)
      const src = source ?? audioCtx.createMediaElementSource(audioElement);
      setSource(src);

      // Connect audio graph with filter
      src.connect(filter).connect(analyser);

      // Setup event listeners - check array length before accessing
      bpmAnalyzer.on('bpmStable', (data: BpmCandidates) => {
        if (data.bpm.length > 0) {
          setCurrentBpm(data.bpm[0].tempo);
          if (data.bpm.length > 1) {
            setConcurrentBpm(data.bpm[1].tempo);
          }
        }
      });

      setIsAnalyzing(true);
    } catch (error) {
      console.error('Failed to start BPM analysis:', error);
    }
  }

  async function stopAnalysis() {
    if (!audioContext || !source || !realtimeAnalyzerNode) {
      return;
    }

    // Suspend instead of close to allow reuse
    await audioContext.suspend();

    // Disconnect all nodes
    source.disconnect();
    analyser?.disconnect();
    biquadFilterNode?.disconnect();
    realtimeAnalyzerNode.disconnect();

    // Reset state
    setCurrentBpm(0);
    setConcurrentBpm(0);
    setIsAnalyzing(false);
  }

  return { currentBpm, concurrentBpm, isAnalyzing, startAnalysis, stopAnalysis };
}
```

## Custom Hook Pattern (Alternative)

If you prefer reusable hooks, extract the logic:

```tsx
import { useEffect, useState } from 'react';
import { createRealTimeBpmProcessor, getBiquadFilter } from 'realtime-bpm-analyzer';
import type { BpmAnalyzer, BpmCandidates } from 'realtime-bpm-analyzer';

export function useBPMAnalyzer() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentBpm, setCurrentBpm] = useState<number>(0);
  const [concurrentBpm, setConcurrentBpm] = useState<number>(0);
  const [audioContext, setAudioContext] = useState<AudioContext>();
  const [source, setSource] = useState<MediaElementAudioSourceNode>();
  const [analyser, setAnalyser] = useState<AnalyserNode>();
  const [realtimeAnalyzerNode, setRealtimeAnalyzerNode] = useState<BpmAnalyzer>();
  const [biquadFilterNode, setBiquadFilterNode] = useState<BiquadFilterNode>();

  const startAnalysis = async (audioElement: HTMLAudioElement) => {
    try {
      const audioCtx = audioContext ?? new AudioContext();
      setAudioContext(audioCtx);
      await audioCtx.resume();

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      setAnalyser(analyser);

      const bpmAnalyzer = await createRealTimeBpmProcessor(audioCtx);
      setRealtimeAnalyzerNode(bpmAnalyzer);

      const filter = getBiquadFilter(audioCtx);
      setBiquadFilterNode(filter);

      const src = source ?? audioCtx.createMediaElementSource(audioElement);
      setSource(src);

      src.connect(filter).connect(analyser);

      bpmAnalyzer.on('bpmStable', (data: BpmCandidates) => {
        if (data.bpm.length > 0) {
          setCurrentBpm(data.bpm[0].tempo);
          if (data.bpm.length > 1) {
            setConcurrentBpm(data.bpm[1].tempo);
          }
        }
      });

      setIsAnalyzing(true);
    } catch (error) {
      console.error('Failed to start BPM analysis:', error);
    }
  };

  const stopAnalysis = async () => {
    if (!audioContext || !source || !realtimeAnalyzerNode) {
      return;
    }

    await audioContext.suspend();
    source.disconnect();
    analyser?.disconnect();
    biquadFilterNode?.disconnect();
    realtimeAnalyzerNode.disconnect();

    setCurrentBpm(0);
    setConcurrentBpm(0);
    setIsAnalyzing(false);
  };

  useEffect(() => {
    return () => {
      stopAnalysis().catch(console.error);
    };
  }, []);

  return { currentBpm, concurrentBpm, isAnalyzing, startAnalysis, stopAnalysis };
}
```

## Usage Example

```tsx
import { useRef } from 'react';
import { useBPMAnalyzer } from './hooks/useBPMAnalyzer';

export default function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const { currentBpm, concurrentBpm, isAnalyzing, startAnalysis, stopAnalysis } = useBPMAnalyzer();

  const handlePlay = async () => {
    if (audioRef.current && !isAnalyzing) {
      await startAnalysis(audioRef.current);
      audioRef.current.play();
    }
  };

  const handleStop = async () => {
    if (audioRef.current) {
      audioRef.current.pause();
      await stopAnalysis();
    }
  };

  return (
    <div>
      <audio ref={audioRef} src="/audio/song.mp3" />
      
      <button onClick={handlePlay} disabled={isAnalyzing}>
        Play & Analyze
      </button>
      
      <button onClick={handleStop} disabled={!isAnalyzing}>
        Stop
      </button>
      
      {isAnalyzing && (
        <div>
          {currentBpm === 0 ? (
            <p>Analyzing...</p>
          ) : (
            <div>
              <p>BPM: {currentBpm}</p>
              {concurrentBpm > 0 && <p>Alternative: {concurrentBpm} BPM</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

## TypeScript Types

```tsx
import type { BpmCandidates, BpmAnalyzer } from 'realtime-bpm-analyzer';

interface BPMAnalyzerState {
  currentBpm: number;
  concurrentBpm: number;
  isAnalyzing: boolean;
  audioContext?: AudioContext;
  source?: MediaElementAudioSourceNode;
  analyser?: AnalyserNode;
  realtimeAnalyzerNode?: BpmAnalyzer;
  biquadFilterNode?: BiquadFilterNode;
}

interface BPMAnalyzerHook {
  currentBpm: number;
  concurrentBpm: number;
  isAnalyzing: boolean;
  startAnalysis: (audio: HTMLAudioElement) => Promise<void>;
  stopAnalysis: () => Promise<void>;
}
```

## Key Considerations

- **Cleanup**: Always clean up audio context and remove event listeners in cleanup functions
- **State vs Refs**: Use `useState` for nodes that need cleanup tracking; refs for values that don't trigger renders
- **User Gesture**: Start AudioContext after user interaction (button click) due to browser autoplay policies
- **Single Instance**: Reuse existing AudioContext when possible; avoid creating multiple sources for the same element
- **Context Reuse**: Use `suspend()` instead of `close()` if you plan to reuse the AudioContext
- **Array Safety**: Always check `data.bpm.length` before accessing array elements
- **Filtering**: Use `getBiquadFilter` for better low-frequency detection accuracy
- **Cleanup Pattern**: Use ref pattern in useEffect to avoid stale closures; remove listeners with `off()` using same handler reference

## Complete Examples

See our working examples:
- [Microphone Input](/examples/microphone-input) - Real-time analysis
- [File Upload](/examples/file-upload) - Batch processing
- [Streaming Audio](/examples/streaming-audio) - Online streams

## Next Steps

- [Next.js Integration](/examples/nextjs) - Server-side rendering considerations
- [Vue Integration](/examples/vue) - Vue 3 Composition API
- [API Reference](/api/) - Full API documentation
