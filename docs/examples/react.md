# React Integration

How to integrate Realtime BPM Analyzer in React applications.

## Installation

```bash
npm install realtime-bpm-analyzer
```

## Basic Hook Pattern

Create a reusable hook for BPM analysis:

```tsx
import { useEffect, useRef, useState } from 'react';
import { createRealTimeBpmProcessor } from 'realtime-bpm-analyzer';

export function useBPMAnalyzer() {
  const [bpm, setBpm] = useState<number>(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AudioWorkletNode | null>(null);

  const startAnalysis = async (audioElement: HTMLAudioElement) => {
    try {
      // Create audio context
      const audioContext = new AudioContext();
      await audioContext.resume();
      
      // Create analyzer
      const analyzer = await createRealTimeBpmProcessor(audioContext);
      
      // Create source and connect
      const source = audioContext.createMediaElementSource(audioElement);
      source.connect(analyzer);
      source.connect(audioContext.destination);
      
      // Listen for BPM events
      analyzer.port.onmessage = (event) => {
        if (event.data.message === 'BPM_STABLE') {
          const detected = event.data.data.bpm[0]?.tempo || 0;
          setBpm(detected);
        }
      };
      
      audioContextRef.current = audioContext;
      analyzerRef.current = analyzer;
      setIsAnalyzing(true);
    } catch (error) {
      console.error('Failed to start BPM analysis:', error);
    }
  };

  const stopAnalysis = async () => {
    if (audioContextRef.current) {
      await audioContextRef.current.close();
      audioContextRef.current = null;
      analyzerRef.current = null;
      setIsAnalyzing(false);
      setBpm(0);
    }
  };

  useEffect(() => {
    return () => {
      stopAnalysis();
    };
  }, []);

  return { bpm, isAnalyzing, startAnalysis, stopAnalysis };
}
```

## Usage Example

```tsx
import { useRef } from 'react';
import { useBPMAnalyzer } from './hooks/useBPMAnalyzer';

export default function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const { bpm, isAnalyzing, startAnalysis, stopAnalysis } = useBPMAnalyzer();

  const handlePlay = async () => {
    if (audioRef.current && !isAnalyzing) {
      await startAnalysis(audioRef.current);
      audioRef.current.play();
    }
  };

  return (
    <div>
      <audio ref={audioRef} src="/audio/song.mp3" />
      
      <button onClick={handlePlay}>
        Play & Analyze
      </button>
      
      <button onClick={stopAnalysis}>
        Stop
      </button>
      
      {isAnalyzing && (
        <div>
          <p>BPM: {bpm || 'Detecting...'}</p>
        </div>
      )}
    </div>
  );
}
```

## TypeScript Types

```tsx
import type { BpmCandidates } from 'realtime-bpm-analyzer';

interface BPMAnalyzerHook {
  bpm: number;
  isAnalyzing: boolean;
  startAnalysis: (audio: HTMLAudioElement) => Promise<void>;
  stopAnalysis: () => Promise<void>;
}
```

## Key Considerations

- **Cleanup**: Always clean up audio context in `useEffect` return
- **Refs**: Use refs for audio context and analyzer to persist across renders
- **User Gesture**: Start AudioContext after user interaction (button click)
- **Single Instance**: Avoid creating multiple analyzers for the same source

## Complete Examples

See our working examples:
- [Microphone Input](/examples/microphone-input) - Real-time analysis
- [File Upload](/examples/file-upload) - Batch processing
- [Streaming Audio](/examples/streaming-audio) - Online streams

## Next Steps

- [Next.js Integration](/examples/nextjs) - Server-side rendering considerations
- [Vue Integration](/examples/vue) - Vue 3 Composition API
- [API Reference](/api/) - Full API documentation
