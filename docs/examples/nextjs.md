# Next.js Integration

How to integrate Realtime BPM Analyzer in Next.js applications with App Router or Pages Router.

## Installation

```bash
npm install realtime-bpm-analyzer
```

## Important: Client-Side Only

The library uses Web Audio API which **only works in the browser**. You must use client-side rendering.

### App Router (Next.js 13+)

Add `'use client'` directive:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { createRealTimeBpmProcessor } from 'realtime-bpm-analyzer';

export default function BPMAnalyzer() {
  const [bpm, setBpm] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const analyze = async () => {
    if (!audioRef.current) return;

    const audioContext = new AudioContext();
    const analyzer = await createRealTimeBpmProcessor(audioContext);
    const source = audioContext.createMediaElementSource(audioRef.current);

    source.connect(analyzer).connect(audioContext.destination);

    // Use typed event listeners
    analyzer.on('bpmStable', (data) => {
      setBpm(data.bpm[0]?.tempo || 0);
    });

    audioRef.current.play();
  };

  return (
    <div>
      <audio ref={audioRef} src="/audio/song.mp3" />
      <button onClick={analyze}>Analyze BPM</button>
      {bpm > 0 && <p>BPM: {bpm}</p>}
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

import { useEffect, useRef, useState } from 'react';
import { createRealTimeBpmProcessor } from 'realtime-bpm-analyzer';
import type { BpmAnalyzer } from 'realtime-bpm-analyzer';

export function useBPMAnalyzer() {
  const [bpm, setBpm] = useState(0);
  const contextRef = useRef<AudioContext>();
  const analyzerRef = useRef<BpmAnalyzer>();

  const analyze = async (audioElement: HTMLAudioElement) => {
    const ctx = new AudioContext();
    const analyzer = await createRealTimeBpmProcessor(ctx);
    const source = ctx.createMediaElementSource(audioElement);

    source.connect(analyzer).connect(ctx.destination);

    // Use typed event listeners
    analyzer.on('bpmStable', (data) => {
      setBpm(data.bpm[0]?.tempo || 0);
    });

    contextRef.current = ctx;
    analyzerRef.current = analyzer;
  };

  useEffect(() => {
    return () => {
      analyzerRef.current?.removeAllListeners();
      contextRef.current?.close();
    };
  }, []);

  return { bpm, analyze };
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
- ✅ Clean up AudioContext in useEffect
- ✅ Place audio files in `public/` folder
- ❌ Never import the library in server components

## Complete Examples

See detailed implementations:
- [Microphone Input](/examples/microphone-input)
- [File Upload](/examples/file-upload)
- [Streaming Audio](/examples/streaming-audio)

## Next Steps

- [React Integration](/examples/react) - React hooks pattern
- [Vue Integration](/examples/vue) - Vue 3 Composition API
- [API Reference](/api/) - Full documentation
