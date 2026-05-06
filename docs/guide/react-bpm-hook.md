---
title: useBpm — A React Hook for Realtime BPM Detection
description: A drop-in, fully typed React hook that wraps realtime-bpm-analyzer for file, microphone, and stream BPM detection. StrictMode-safe cleanup, no global state, no leaked audio contexts.
head:
  - - meta
    - name: keywords
      content: react bpm detection, react bpm hook, useBpm react, bpm detection react, web audio react hook, realtime bpm react
---

# useBpm — A React Hook for Realtime BPM Detection

There is no canonical React hook for BPM detection. Most React tutorials
that touch the Web Audio API stash an `AudioContext` in component state,
forget to close it on unmount, and leak audio threads on every navigation.
Once `<React.StrictMode>` enters the picture in development, effects fire
twice and the leaks compound — two contexts open, two microphones held,
two analyzers running.

This guide builds a `useBpm` hook that does it correctly. One source in,
one BPM value out, full TypeScript types, StrictMode-safe cleanup. You
can copy it into your project today.

## What you'll get

```tsx
function MyApp() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const { bpm, stableBpm, state, error, start, stop } = useBpm(audioRef);

  return (
    <div>
      <audio ref={audioRef} src="/song.mp3" controls />
      <button onClick={start} disabled={state !== 'idle'}>Start</button>
      <button onClick={stop} disabled={state === 'idle'}>Stop</button>
      <p>Live: {bpm ?? '—'}</p>
      <p>Stable: {stableBpm ?? '—'}</p>
      {error && <p>Error: {error.message}</p>}
    </div>
  );
}
```

The hook accepts either a ref to an `HTMLAudioElement`, a microphone
input request, or a stream URL. It returns the live BPM, the stable BPM,
a state machine, an error, and explicit `start`/`stop` controls.

## Installation

```bash
npm install realtime-bpm-analyzer
```

React 18 or 19. The hook is framework-agnostic in spirit — port to
Solid, Preact, or Svelte runes is straightforward.

## The hook

Save as `useBpm.ts`. It's about 100 lines and self-contained.

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createRealtimeBpmAnalyzer,
  getBiquadFilter,
  type BpmAnalyzer,
} from 'realtime-bpm-analyzer';

type Source =
  | { type: 'audio'; element: HTMLAudioElement }
  | { type: 'microphone' }
  | { type: 'stream'; url: string };

export type UseBpmState = 'idle' | 'starting' | 'listening' | 'error';

export interface UseBpmReturn {
  /** Live BPM — updates ~once per second. Null until first detection. */
  bpm: number | null;
  /** Stable BPM — high-confidence value. Null until algorithm settles. */
  stableBpm: number | null;
  /** Current state. Drives UI affordances. */
  state: UseBpmState;
  /** Error from getUserMedia, audio context, or worklet load. */
  error: Error | null;
  /** Begin analysis. Must be called from a user gesture (click, touch). */
  start: () => Promise<void>;
  /** Stop analysis. Releases mic, closes audio context. Idempotent. */
  stop: () => void;
}

export function useBpm(source: Source | null): UseBpmReturn {
  const [bpm, setBpm] = useState<number | null>(null);
  const [stableBpm, setStableBpm] = useState<number | null>(null);
  const [state, setState] = useState<UseBpmState>('idle');
  const [error, setError] = useState<Error | null>(null);

  // Live refs — survive re-renders, don't trigger effects.
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<BpmAnalyzer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    analyzerRef.current?.disconnect();
    analyzerRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    audioContextRef.current?.close();
    audioContextRef.current = null;

    setState('idle');
  }, []);

  const start = useCallback(async () => {
    if (!source) {
      setError(new Error('useBpm: no source provided'));
      setState('error');
      return;
    }
    if (state !== 'idle') return; // already running or starting

    setState('starting');
    setError(null);

    try {
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      await audioContext.resume();

      let sourceNode: AudioNode;

      if (source.type === 'audio') {
        sourceNode = audioContext.createMediaElementSource(source.element);
        // Audio elements need to play through the speakers too.
        sourceNode.connect(audioContext.destination);
      } else if (source.type === 'microphone') {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        streamRef.current = stream;
        sourceNode = audioContext.createMediaStreamSource(stream);
        // Mic must NOT connect to destination — feedback loop.
      } else {
        // type: 'stream'
        const audio = new Audio(source.url);
        audio.crossOrigin = 'anonymous';
        await audio.play();
        sourceNode = audioContext.createMediaElementSource(audio);
        sourceNode.connect(audioContext.destination);
      }

      const analyzer = await createRealtimeBpmAnalyzer(audioContext);
      analyzerRef.current = analyzer;

      const lowpass = getBiquadFilter(audioContext);
      sourceNode.connect(lowpass).connect(analyzer.node);

      analyzer.on('bpm', ({ bpm: candidates }) => {
        if (candidates.length > 0) setBpm(candidates[0].tempo);
      });
      analyzer.on('bpmStable', ({ bpm: candidates }) => {
        if (candidates.length > 0) setStableBpm(candidates[0].tempo);
      });

      setState('listening');
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setState('error');
      stop();
    }
  }, [source, state, stop]);

  // StrictMode-safe cleanup. The empty deps array means cleanup runs on
  // unmount only — but in StrictMode, React mounts twice in dev, so the
  // first cleanup MUST tear everything down. The refs above guarantee
  // idempotency: stop() can be called safely from a cleanup that runs on
  // a hook instance that never started anything.
  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { bpm, stableBpm, state, error, start, stop };
}
```

That is the entire hook. Three states it can be in (`idle`, `starting`,
`listening`, `error`), three sources it can wire (`audio`, `microphone`,
`stream`), one symmetric cleanup path that releases everything.

## Usage: file analysis

```tsx
import { useRef } from 'react';
import { useBpm } from './useBpm';

export function FileAnalyzer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const { bpm, stableBpm, state, error, start, stop } = useBpm(
    audioRef.current ? { type: 'audio', element: audioRef.current } : null
  );

  return (
    <div>
      <audio ref={audioRef} src="/song.mp3" controls />
      <button onClick={start} disabled={state !== 'idle'}>
        Analyse
      </button>
      <button onClick={stop} disabled={state === 'idle'}>
        Stop
      </button>
      <div>Live BPM: {bpm ?? '—'}</div>
      <div>Stable BPM: {stableBpm ?? '—'}</div>
      {error && <div role="alert">{error.message}</div>}
    </div>
  );
}
```

The `audioRef.current ? ... : null` guard handles the first render —
the ref is null until React commits the DOM. After mount it's fine.

## Usage: microphone

```tsx
export function MicAnalyzer() {
  const { bpm, stableBpm, state, error, start, stop } = useBpm({ type: 'microphone' });

  return (
    <div>
      <button onClick={start} disabled={state !== 'idle'}>
        Listen
      </button>
      <button onClick={stop} disabled={state === 'idle'}>
        Stop
      </button>
      <div>Live BPM: {bpm ?? '—'}</div>
      <div>Stable BPM: {stableBpm ?? '—'}</div>
      {state === 'starting' && <div>Asking for microphone…</div>}
      {error && <div role="alert">{error.message}</div>}
    </div>
  );
}
```

The microphone variant doesn't need a ref. Just call `start` from a
click handler — the `getUserMedia` permission prompt is gated on a user
gesture, and the click satisfies that.

## Usage: streaming URL

```tsx
export function StreamAnalyzer({ url }: { url: string }) {
  const { bpm, stableBpm, state, error, start, stop } = useBpm({ type: 'stream', url });

  return (
    <div>
      <button onClick={start}>Listen to stream</button>
      <button onClick={stop}>Stop</button>
      <div>BPM: {stableBpm ?? bpm ?? '—'}</div>
    </div>
  );
}
```

For HLS or DASH content, render an `<audio>` element and let the
streaming library (`hls.js`, Shaka, etc.) attach to it, then pass the
element to the `audio` source variant. The hook doesn't need to know
anything about transport.

## StrictMode and double-invocation

`<React.StrictMode>` mounts every component twice in development. If the
hook's effect started anything during the first mount, the first cleanup
must tear it back down before the second mount runs. Otherwise: two
audio contexts, two analyzers, two open microphones. By the third
re-render, the user is staring at a screaming feedback loop.

The hook avoids this by **not starting anything in the effect**. Start
is explicit — it only fires when the user clicks. The effect only runs
the cleanup. Re-mounts are free; nothing is held until `start` is called.

The cleanup is also idempotent. `stop()` checks the refs and only acts
when something is open. Calling it from a never-started component does
nothing.

This pattern is the default-safe shape for any hook that touches a
real-world resource (audio, video, sockets, geolocation, file system).
Consider it the React equivalent of the "explicit lifetime" pattern in
Rust.

## The state machine, in one diagram

```
     start()              auto on success
   ┌────────► starting ───────────────────► listening
   │                │                         │
 idle              fail                      stop()
   ▲                │                         │
   │            error state                  │
   └────────────────┴──────── stop() ────────┘
```

`state` is a useful UI affordance. Disable buttons when not in `idle`,
show a "requesting permission" indicator in `starting`, render an alert
in `error`. The state machine is tight enough that you can render any
UI directly off it.

## TypeScript notes

The hook is fully typed. The `Source` union forces the caller to pick a
mode at the type level — there is no way to call `start` without the
source being a valid kind. The return shape is stable across renders;
`bpm` and `stableBpm` are `number | null` and never undefined.

If you want to consume the underlying analyzer events directly — for
example, to read the `confidence` field on each candidate — you can
expose an `onAnalyzer` callback in the source object and forward it
inside `start`:

```tsx
type Source =
  | { type: 'audio'; element: HTMLAudioElement; onAnalyzer?: (a: BpmAnalyzer) => void }
  // …
```

That keeps the typed event API of `realtime-bpm-analyzer` available
to advanced callers without changing the simple shape of the hook
return.

## What's missing on purpose

This hook is intentionally small. Things you might add for production:

- **Persistent state**: write `stableBpm` to local storage so it survives
  reload.
- **Multiple sources**: a "BPM matrix" component that runs four hooks in
  parallel for a four-deck DJ practice tool.
- **Tap-tempo fallback**: when `state === 'error'` or `bpmStable` never
  fires, fall back to a manual tap input.
- **Confidence threshold**: only update `stableBpm` when
  `candidates[0].confidence > 0.7`.

All of these are 5–10 line additions. Keep the hook itself focused; let
the consuming component compose.

## Try it live

The library ships three runnable React examples — file, streaming,
microphone — alongside this hook pattern in the official
[examples directory](https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/examples).

- [React example overview](/examples/react)
- [Vue example overview](/examples/vue) — composable equivalent

## What's next

- The [Realtime BPM Detection guide](/guide/realtime-bpm-detection) covers
  the underlying API in depth.
- The [Microphone tutorial](/guide/bpm-from-microphone) goes deeper on
  permissions, mobile gotchas, and ambient detection.
- The [How It Works guide](/guide/how-it-works) explains why the
  algorithm sometimes picks half-time or double-time aliases — useful if
  your hook needs to disambiguate.

If `useBpm` saved you an afternoon, **a star on
[GitHub](https://github.com/dlepaux/realtime-bpm-analyzer)** is what
keeps this kind of content shipping.
