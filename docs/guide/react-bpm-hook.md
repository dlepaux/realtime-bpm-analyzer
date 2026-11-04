---
title: 'useBpm: A React Hook for Realtime BPM Detection'
description: A typed React hook that wraps realtime-bpm-analyzer for file, microphone, and stream BPM detection. StrictMode-safe cleanup, no global state, no leaked audio contexts.
head:
  - - meta
    - name: keywords
      content: react bpm detection, react bpm hook, useBpm react, bpm detection react, web audio react hook, realtime bpm react
---

# useBpm: A React Hook for Realtime BPM Detection {#usebpm-—-a-react-hook-for-realtime-bpm-detection}

An `AudioContext` kept in component state and never closed keeps its
audio thread running after the component unmounts. Under
`<React.StrictMode>` in development, effects run twice, so the leak
doubles: two contexts open, two microphones held, two analyzers running.

This guide builds a `useBpm` hook that avoids that. One source in, one
BPM value out, TypeScript types, and cleanup that holds under StrictMode.
You can copy it into your project.

## What you'll get

<!-- typecheck: skip, uses the useBpm hook defined below -->
```tsx
function MyApp() {
  const { bpm, lockedBpm, state, error, start, stop } = useBpm({ type: 'microphone' });

  return (
    <div>
      <button onClick={start} disabled={state !== 'idle'}>Start</button>
      <button onClick={stop} disabled={state === 'idle'}>Stop</button>
      <p>Live: {bpm ?? '-'}</p>
      <p>Locked: {lockedBpm ?? '-'}</p>
      {error && <p>Error: {error.message}</p>}
    </div>
  );
}
```

The hook accepts an `HTMLAudioElement`, a microphone input request, or a
stream URL. It returns the live BPM, the locked BPM,
a state machine, an error, and explicit `start`/`stop` controls.

## Installation

```bash
npm install realtime-bpm-analyzer
```

React 18 or 19. The same structure ports to Solid, Preact or Svelte
runes.

## The hook

Save as `useBpm.ts`. It's about 100 lines and self-contained.

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createRealtimeBpmAnalyzer,
  type BpmAnalyzer,
} from 'realtime-bpm-analyzer';

type Source =
  | { type: 'audio'; element: HTMLAudioElement }
  | { type: 'microphone' }
  | { type: 'stream'; url: string };

export type UseBpmState = 'idle' | 'starting' | 'listening' | 'error';

export interface UseBpmReturn {
  /** Live BPM, updated as the analysis runs. Null until first detection. */
  bpm: number | null;
  /** Locked BPM, from 10 s of audio at the earliest. Null until then. */
  lockedBpm: number | null;
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
  const [lockedBpm, setLockedBpm] = useState<number | null>(null);
  const [state, setState] = useState<UseBpmState>('idle');
  const [error, setError] = useState<Error | null>(null);

  // Live refs: survive re-renders, don't trigger effects.
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<BpmAnalyzer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    analyzerRef.current?.stop();
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
        // Mic must NOT connect to destination: that makes a feedback loop.
      } else {
        // type: 'stream'
        const audio = new Audio(source.url);
        audio.crossOrigin = 'anonymous';
        await audio.play();
        sourceNode = audioContext.createMediaElementSource(audio);
        sourceNode.connect(audioContext.destination);
      }

      // With a microphone, `liveInput` lets the analyzer follow the track's
      // clock, so audio the browser drops doesn't speed the tempo up.
      const liveInput = streamRef.current?.getAudioTracks()[0];
      const analyzer = await createRealtimeBpmAnalyzer(audioContext, { liveInput });
      analyzerRef.current = analyzer;

      // `.input` holds the lowpass filter the default engine expects.
      sourceNode.connect(analyzer.input);

      analyzer.on('reading', ({ bpm }) => {
        setBpm(bpm);
        // The tempo can still move a little while locked: follow it.
        if (analyzer.state.status === 'locked') setLockedBpm(bpm);
      });
      analyzer.on('statechange', ({ to }) => {
        if (to.status === 'locked') setLockedBpm(to.reading.bpm);
      });

      setState('listening');
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setState('error');
      stop();
    }
  }, [source, state, stop]);

  // StrictMode-safe cleanup. The empty deps array means cleanup runs on
  // unmount only. But in StrictMode, React mounts twice in dev, so the
  // first cleanup MUST tear everything down. The refs above guarantee
  // idempotency: stop() can be called safely from a cleanup that runs on
  // a hook instance that never started anything.
  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { bpm, lockedBpm, state, error, start, stop };
}
```

The hook has four states (`idle`, `starting`, `listening`, `error`),
three sources it can wire (`audio`, `microphone`, `stream`), and one
cleanup path that releases everything.

## Usage: file analysis

<!-- typecheck: skip, imports the useBpm hook above from ./useBpm -->
```tsx
import { useRef } from 'react';
import { useBpm } from './useBpm';

export function FileAnalyzer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const { bpm, lockedBpm, state, error, start, stop } = useBpm(
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
      <div>Live BPM: {bpm ?? '-'}</div>
      <div>Locked BPM: {lockedBpm ?? '-'}</div>
      {error && <div role="alert">{error.message}</div>}
    </div>
  );
}
```

The `audioRef.current ? ... : null` guard handles the first render: the
ref is null until React commits the DOM.

## Usage: microphone

<!-- typecheck: skip, uses the useBpm hook above -->
```tsx
export function MicAnalyzer() {
  const { bpm, lockedBpm, state, error, start, stop } = useBpm({ type: 'microphone' });

  return (
    <div>
      <button onClick={start} disabled={state !== 'idle'}>
        Listen
      </button>
      <button onClick={stop} disabled={state === 'idle'}>
        Stop
      </button>
      <div>Live BPM: {bpm ?? '-'}</div>
      <div>Locked BPM: {lockedBpm ?? '-'}</div>
      {state === 'starting' && <div>Asking for microphone…</div>}
      {error && <div role="alert">{error.message}</div>}
    </div>
  );
}
```

The microphone variant doesn't need a ref. Just call `start` from a
click handler: the `getUserMedia` permission prompt is gated on a user
gesture, and the click satisfies that.

## Usage: streaming URL

<!-- typecheck: skip, uses the useBpm hook above -->
```tsx
export function StreamAnalyzer({ url }: { url: string }) {
  const { bpm, lockedBpm, state, error, start, stop } = useBpm({ type: 'stream', url });

  return (
    <div>
      <button onClick={start}>Listen to stream</button>
      <button onClick={stop}>Stop</button>
      <div>BPM: {lockedBpm ?? bpm ?? '-'}</div>
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
must tear it back down before the second mount runs. Otherwise you get
two audio contexts, two analyzers and two open microphones.

The hook avoids this by **not starting anything in the effect**. Start
is explicit: it only fires when the user clicks. The effect only runs
the cleanup. Re-mounts are free; nothing is held until `start` is called.

The cleanup is also idempotent. `stop()` checks the refs and only acts
when something is open. Calling it from a never-started component does
nothing.

The same shape suits any hook that holds a resource outside React
(audio, video, sockets, geolocation, the file system): start on an
explicit call, release in an idempotent cleanup.

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

Drive the UI from `state`: disable buttons when not in `idle`, show a
"requesting permission" indicator in `starting`, render an alert in
`error`.

## TypeScript notes

The hook is typed. The `Source` union makes the caller pick a mode at
the type level, so `start` can't be called with an invalid source. The return shape is stable across renders;
`bpm` and `lockedBpm` are `number | null` and never undefined.

If you want to consume the underlying analyzer events directly, for
example to read each candidate's `relation` to the tempo, you can
expose an `onAnalyzer` callback in the source object and forward it
inside `start`:

<!-- typecheck: skip, a fragment of the Source type above -->
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

- **Persistent state**: write `lockedBpm` to local storage so it survives
  reload.
- **Multiple sources**: a "BPM matrix" component that runs four hooks in
  parallel for a four-deck DJ practice tool.
- **Tap-tempo fallback**: when `state === 'error'` or the analyzer never
  locks, fall back to a manual tap input.
- **Confidence threshold**: only update `lockedBpm` when
  `reading.confidence` clears a cut-off you measured on your own
  material. With the default engine, `confidence` is the share of interval
  votes within ±1 BPM of the tempo: a perfect click track scores about 0.46
  and random peaks below 0.1. No cut-off has been calibrated on real music
  yet. In plain words: confidence never reaches 1, even on a perfect beat,
  so compare values on your own music rather than expecting a high score.

Each of these takes a few lines. Keep the hook itself focused; let
the consuming component compose.

## Try it live

The library ships three runnable React examples (file, streaming,
microphone) in the
[examples directory](https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/examples).

- [React example overview](/examples/react)
- [Vue example overview](/examples/vue): the same as a composable

## What's next

- The [Realtime BPM Detection guide](/guide/realtime-bpm-detection) covers
  the underlying API in depth.
- The [Microphone tutorial](/guide/bpm-from-microphone) goes deeper on
  permissions, mobile browsers and ambient detection.
- The [How It Works guide](/guide/how-it-works) explains why the
  algorithm sometimes picks half-time or double-time readings, which
  helps if your hook needs to tell them apart.

If `useBpm` helps you, a star on
[GitHub](https://github.com/dlepaux/realtime-bpm-analyzer) helps other
developers find the library.
