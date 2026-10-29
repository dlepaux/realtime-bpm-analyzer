---
title: Strict CSP and Browser Extensions — Loading the AudioWorklet from a URL
description: Use realtime-bpm-analyzer on pages whose Content Security Policy blocks blob scripts, and in Manifest V3 Chrome extensions, by loading the published processor file with the processorUrl option.
---

# Strict CSP and Browser Extensions

By default, `createRealtimeBpmAnalyzer` loads its AudioWorklet processor
from a `blob:` URL built from a copy inlined in the library. You don't have
to serve any extra file, which is why it is the default.

A `blob:` module is still a script, so a Content Security Policy that does
not list `blob:` in `script-src` refuses it. `audioWorklet.addModule`
rejects, and `createRealtimeBpmAnalyzer` rejects with
`Failed to load realtime-bpm-analyzer worklet: …`. You hit this:

- on websites with a strict policy such as `script-src 'self'`
- in **Manifest V3 extensions**, where the policy for extension pages and
  offscreen documents is `script-src 'self' 'wasm-unsafe-eval'` and cannot
  be loosened to allow `blob:`

The fix is to serve the processor file from your own origin and pass its
URL as `processorUrl`.

## The published processor file

The package ships the processor as a standalone ES module with no imports:

| Import specifier                  | File in the package               |
| --------------------------------- | --------------------------------- |
| `realtime-bpm-analyzer/processor` | `dist/realtime-bpm-processor.js`  |

It is the same code as the inlined copy. Serve the file from the
`realtime-bpm-analyzer` version your app uses, because the processor and
the main-thread code talk through messages that can change between
versions.

## Websites with a strict CSP

With Vite, the `?url` suffix copies the file into your build and gives you
its URL:

```typescript
import { createRealtimeBpmAnalyzer } from 'realtime-bpm-analyzer';
import processorUrl from 'realtime-bpm-analyzer/processor?url';

const audioContext = new AudioContext();
const analyzer = await createRealtimeBpmAnalyzer(audioContext, { processorUrl });
```

With any other setup, copy
`node_modules/realtime-bpm-analyzer/dist/realtime-bpm-processor.js` into
your static files as a build step and pass its path:

```typescript
const analyzer = await createRealtimeBpmAnalyzer(audioContext, {
  processorUrl: '/realtime-bpm-processor.js',
});
```

`processorUrl` accepts a string or a `URL`. It sits next to the usual
analyzer options (`continuousAnalysis`, `tempoRange` and the rest) and is
never sent to the worklet.

## Manifest V3 extensions

Copy the processor into the extension build (for example with your
bundler's static-copy step), then resolve its URL with
`chrome.runtime.getURL` in the offscreen document or extension page that
creates the `AudioContext`:

```typescript
import { createRealtimeBpmAnalyzer } from 'realtime-bpm-analyzer';

const audioContext = new AudioContext();
const analyzer = await createRealtimeBpmAnalyzer(audioContext, {
  processorUrl: chrome.runtime.getURL('realtime-bpm-processor.js'),
});
```

An extension page loads the extension's own files, so the processor needs
no `web_accessible_resources` entry.

## Related

- [Browser Compatibility](/guide/browser-compatibility) - Platform support details
- [How It Works](/guide/how-it-works) - What the processor does on the audio thread
