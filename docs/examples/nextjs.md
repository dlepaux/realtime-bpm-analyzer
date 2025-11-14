# Next.js Integration

How to integrate Realtime BPM Analyzer in Next.js applications with App Router or Pages Router.

## Installation

```bash
npm install realtime-bpm-analyzer
```

## Important: Client-Side Only

The library uses Web Audio API which **only works in the browser**. You must use client-side rendering.

### App Router (Next.js 13+)

Add `'use client'` directive and implement with proper state management:

```tsx
'use client';

import { useState, useRef } from 'react';
import { createRealTimeBpmProcessor, getBiquadFilter } from 'realtime-bpm-analyzer';
import type { BpmAnalyzer, BpmCandidates } from 'realtime-bpm-analyzer';

export default function BPMAnalyzer() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentBpm, setCurrentBpm] = useState<number>(0);
  const [concurrentBpm, setConcurrentBpm] = useState<number>(0);
  const [audioContext, setAudioContext] = useState<AudioContext>();
  const [source, setSource] = useState<MediaElementAudioSourceNode>();
  const [realtimeAnalyzerNode, setRealtimeAnalyzerNode] = useState<BpmAnalyzer>();
  const audioRef = useRef<HTMLAudioElement>(null);

  async function analyze() {
    if (!audioRef.current) return;

    const audioCtx = audioContext ?? new AudioContext();
    setAudioContext(audioCtx);
    await audioCtx.resume();

    const bpmAnalyzer = await createRealTimeBpmProcessor(audioCtx);
    setRealtimeAnalyzerNode(bpmAnalyzer);

    const filter = getBiquadFilter(audioCtx);
    const src = source ?? audioCtx.createMediaElementSource(audioRef.current);
    setSource(src);

    src.connect(filter).connect(audioCtx.destination);

    // Always check array length before accessing
    bpmAnalyzer.on('bpmStable', (data: BpmCandidates) => {
      if (data.bpm.length > 0) {
        setCurrentBpm(data.bpm[0].tempo);
        if (data.bpm.length > 1) {
          setConcurrentBpm(data.bpm[1].tempo);
        }
      }
    });

    audioRef.current.play();
    setIsAnalyzing(true);
  }

  async function stop() {
    if (!audioContext || !source || !realtimeAnalyzerNode) return;

    await audioContext.suspend();
    source.disconnect();
    realtimeAnalyzerNode.disconnect();

    setCurrentBpm(0);
    setConcurrentBpm(0);
    setIsAnalyzing(false);
  }

  return (
    <div>
      <audio ref={audioRef} src="/audio/song.mp3" />
      <button onClick={analyze} disabled={isAnalyzing}>Analyze BPM</button>
      <button onClick={stop} disabled={!isAnalyzing}>Stop</button>
      {currentBpm > 0 && (
        <div>
          <p>BPM: {currentBpm}</p>
          {concurrentBpm > 0 && <p>Alternative: {concurrentBpm}</p>}
        </div>
      )}
    </div>
  );
}
```

### Pages Router (Next.js 12 and below)

Use dynamic import with `ssr: false`:

```tsx
import dynamic from 'next/dynamic';

const BPMAnalyzer = dynamic(
  () => import('../components/BPMAnalyzer'),
  { ssr: false }
);

export default function Page() {
  return <BPMAnalyzer />;
}
```

## Custom Hook

Create a reusable hook at `hooks/useBPMAnalyzer.ts`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { createRealTimeBpmProcessor, getBiquadFilter } from 'realtime-bpm-analyzer';
import type { BpmAnalyzer, BpmCandidates } from 'realtime-bpm-analyzer';

export function useBPMAnalyzer() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentBpm, setCurrentBpm] = useState<number>(0);
  const [concurrentBpm, setConcurrentBpm] = useState<number>(0);
  const [audioContext, setAudioContext] = useState<AudioContext>();
  const [source, setSource] = useState<MediaElementAudioSourceNode>();
  const [realtimeAnalyzerNode, setRealtimeAnalyzerNode] = useState<BpmAnalyzer>();

  const analyze = async (audioElement: HTMLAudioElement) => {
    const ctx = audioContext ?? new AudioContext();
    setAudioContext(ctx);
    await ctx.resume();

    const bpmAnalyzer = await createRealTimeBpmProcessor(ctx);
    setRealtimeAnalyzerNode(bpmAnalyzer);

    const filter = getBiquadFilter(ctx);
    const src = source ?? ctx.createMediaElementSource(audioElement);
    setSource(src);

    src.connect(filter).connect(ctx.destination);

    bpmAnalyzer.on('bpmStable', (data: BpmCandidates) => {
      if (data.bpm.length > 0) {
        setCurrentBpm(data.bpm[0].tempo);
        if (data.bpm.length > 1) {
          setConcurrentBpm(data.bpm[1].tempo);
        }
      }
    });

    setIsAnalyzing(true);
  };

  const stop = async () => {
    if (!audioContext || !source || !realtimeAnalyzerNode) return;

    await audioContext.suspend();
    source.disconnect();
    realtimeAnalyzerNode.disconnect();

    setCurrentBpm(0);
    setConcurrentBpm(0);
    setIsAnalyzing(false);
  };

  useEffect(() => {
    return () => {
      stop().catch(console.error);
    };
  }, []);

  return { currentBpm, concurrentBpm, isAnalyzing, analyze, stop };
}
```

## Static Assets

Place audio files in the `public` folder:

```
public/
  audio/
    song.mp3
    track.wav
```

Reference them:

```tsx
<audio src="/audio/song.mp3" />
```

## TypeScript Configuration

Ensure `tsconfig.json` includes:

```json
{
  "compilerOptions": {
    "lib": ["dom", "es2015"],
    "moduleResolution": "bundler"
  }
}
```

## Key Points

- ✅ Always use `'use client'` in App Router
- ✅ Use dynamic imports with `ssr: false` in Pages Router
- ✅ Manage state with `useState` for proper cleanup tracking
- ✅ Use `suspend()` instead of `close()` if reusing AudioContext
- ✅ Always check `data.bpm.length` before accessing array elements
- ✅ Use ref pattern for cleanup in useEffect to avoid stale closures
- ✅ Place audio files in `public/` folder
- ✅ Use `getBiquadFilter` for better low-frequency detection
- ❌ Never import the library in server components
- ❌ Don't create multiple sources for the same audio element

## Complete Examples

See detailed implementations:
- [Microphone Input](/examples/microphone-input)
- [File Upload](/examples/file-upload)
- [Streaming Audio](/examples/streaming-audio)

## Next Steps

- [React Integration](/examples/react) - React hooks pattern
- [Vue Integration](/examples/vue) - Vue 3 Composition API
- [API Reference](/api/) - Full documentation
