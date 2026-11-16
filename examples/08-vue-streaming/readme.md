# Vue Streaming Example

This example demonstrates how to analyze BPM from streaming audio URLs using Vue 3.

## Features

- Load and play audio streams from URLs
- Real-time BPM detection using `createRealtimeBpmAnalyzer()`
- Audio filtering with `getBiquadFilter()`
- Playback controls (play, pause, stop)
- Vue 3 Composition API with `<script setup>`

## The audio it starts on

The URL field starts on `public/click-128.mp3`, a 20-second 128 BPM click track that the page serves
itself, so the example plays from a clean clone with no other server. It is the library's own test
audio (`packages/cli/tests/fixtures/click-128.mp3`, made by `createClickTrack`), under the repo's
Apache-2.0 licence.

To analyse a stream from another site instead, paste its URL. Two things must hold:

- its server sends CORS headers (`Access-Control-Allow-Origin`), or the browser hands the analyzer
  silence;
- the station's terms allow other websites or apps to play it. Many allow personal listening only.

## Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3008](http://localhost:3008) in your browser.
