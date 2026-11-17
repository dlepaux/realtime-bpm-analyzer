---
title: What is Realtime BPM Analyzer?
description: 'A zero-dependency TypeScript library that detects the tempo (BPM) of audio in the browser and Node.js, from files, a microphone or a live stream.'
---

# What is Realtime BPM Analyzer?

Realtime BPM Analyzer is a TypeScript library that detects the **tempo**, in beats per minute (BPM), of audio
while it plays: a song in an `<audio>` or `<video>` element, a microphone, a radio stream. It also reads a whole
file at once. It has no dependencies, and the audio never leaves the device it runs on.

## What it reads

- **A media element**: `<audio>` and `<video>`, as they play
- **A file**: any format the browser can decode, such as MP3, WAV or FLAC
- **A microphone**, through `getUserMedia`
- **A network stream**, such as an internet radio
- **Any other Web Audio source** you connect to it

## What it reports

A live analyzer emits events as it listens:

- `reading`: the tempo it hears now, with up to five candidate tempos and how each relates to it: half, double or other
- `statechange`: from `listening` to `settling`, then to `locked` once the readings agree
- `progress`: how far it is toward its first reading
- `kick`: each kick drum, as it hears it
- `error`: an analysis step that failed; the next one runs

A whole file gives one reading back, in the same shape, or `null` when it finds no clear beat.

## How it finds the tempo

It runs in an `AudioWorklet`, on the browser's audio thread, so the page stays responsive. It has two engines,
and both report the same kind of reading:

- **`tempogram`**, the default, measures how the spectrum changes from moment to moment across several frequency
  bands, and looks for the tempo that repeats in those changes.
- **`peaks`**, the engine of version 5, keeps the bass, finds where the signal peaks above a threshold it lowers
  step by step, and groups the time between those peaks into tempos. Select it with `engine: 'peaks'`.

[How It Works](/guide/how-it-works) goes into each step.

## Where it runs

- **Browsers** with the Web Audio API and `AudioWorklet`: see [Browser Compatibility](/guide/browser-compatibility)
- **Node.js**, on decoded audio: [BPM Detection in Node.js](/guide/node)
- **A terminal**, on files and folders: [the CLI](/guide/cli)
- **AI assistants** that speak MCP: [the MCP server](/guide/mcp)
- **Python**: [the Python port](/guide/python)
- **Java, Kotlin and Android**: [the Java port](/guide/java)

## What it is for

- DJ tools that show or match the tempo of a track
- Music players that display it
- Visuals and lights that follow the beat
- Fitness apps that pick music by its tempo
- Tools that tag a music library with each track's BPM

## Next steps

- [Getting Started](/guide/getting-started): install it and read your first tempo
- [Core Concepts](/guide/core-concepts): the analyzer, its events and its states
- [Examples](/examples/basic-usage): complete pages to copy from
