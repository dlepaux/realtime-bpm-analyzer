---
title: "BPM to Frames (FPS) Calculator"
description: "BPM to frames calculator: frames per beat and per bar at 23.976 to 60 fps or any frame rate, to cut video on the beat, with the drift of a rounded cut."
aside: false
editLink: false
tool:
  name: BPM to Frames Calculator
  featureList:
    - Frames per beat and per bar at 23.976, 24, 25, 29.97, 30, 50, 59.94 and 60 fps
    - A custom frame rate from 1 to 240 fps
    - Any bar length from 1 to 16 beats
    - The drift of cutting on a whole number of frames, in frames and milliseconds
    - Click any value to copy it
faq:
  - q: How do I convert BPM to frames?
    a: Multiply the frame rate by 60 and divide by the BPM. The result is the number of frames in one beat. At 120 BPM and 24 fps that is 24 × 60 ÷ 120 = 12 frames, and a 4/4 bar is 48 frames.
  - q: What if the frames per beat isn't a whole number?
    a: Cut on the frame nearest to each beat, counted from the first beat, rather than every rounded number of frames. Each cut is then off by half a frame at most and the error never builds up. Cutting every rounded number of frames drifts, and the last column shows by how much per bar.
  - q: Why use 23.976 and not 24?
    a: 23.976 fps is really 24000/1001, the NTSC film rate, and 29.97 and 59.94 are 30000/1001 and 60000/1001. The calculator uses the exact fractions. Over a three-minute song at 120 BPM, treating 23.976 as 24 is off by about four frames.
  - q: Which tempo gives a whole number of frames?
    a: A tempo that divides 60 × fps evenly. At 24 fps that includes 60, 72, 80, 90, 96, 120, 144 and 160 BPM. At 25 fps, 60, 75, 100, 125 and 150 BPM.
  - q: How do I find the BPM of my music?
    a: Drop the song or the video into the video BPM finder, which detects the tempo in your browser, or tap along with the tap tempo tool.
---

<script setup>
import BpmToFrames from './.vitepress/components/BpmToFrames.vue'
import ToolFaq from './.vitepress/components/ToolFaq.vue'
</script>

# BPM to Frames Calculator

Frames per beat equals the frame rate times 60, divided by the BPM. At 120 BPM
and 24 fps one beat is 12 frames, and a 4/4 bar is 48 frames.

Type a tempo and get the length of one beat and one bar in frames, at every
common frame rate, for cutting video on the beat. Click any value to copy it.

<BpmToFrames />

## The formula

One beat lasts 60 ÷ BPM seconds, so:

- **Frames per beat = fps × 60 ÷ BPM**
- **Frames per bar = frames per beat × beats per bar**

At 128 BPM and 25 fps a beat is 11.72 frames and a 4/4 bar 46.875 frames.
Cutting every 47 frames puts each bar 0.125 frames late, 5 ms, which adds up
to a full frame after eight bars. Cutting on the frame nearest to each beat,
counted from the first beat, keeps every cut within half a frame.

## Frames per beat chart

Common tempos, in frames per beat:

| BPM | 23.976 | 24 | 25 | 29.97 | 30 | 50 | 59.94 | 60 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 60 | 23.98 | 24 | 25 | 29.97 | 30 | 50 | 59.94 | 60 |
| 70 | 20.55 | 20.57 | 21.43 | 25.69 | 25.71 | 42.86 | 51.38 | 51.43 |
| 80 | 17.98 | 18 | 18.75 | 22.48 | 22.5 | 37.5 | 44.96 | 45 |
| 90 | 15.98 | 16 | 16.67 | 19.98 | 20 | 33.33 | 39.96 | 40 |
| 100 | 14.39 | 14.4 | 15 | 17.98 | 18 | 30 | 35.96 | 36 |
| 110 | 13.08 | 13.09 | 13.64 | 16.35 | 16.36 | 27.27 | 32.69 | 32.73 |
| 120 | 11.99 | 12 | 12.5 | 14.99 | 15 | 25 | 29.97 | 30 |
| 124 | 11.6 | 11.61 | 12.1 | 14.5 | 14.52 | 24.19 | 29 | 29.03 |
| 128 | 11.24 | 11.25 | 11.72 | 14.05 | 14.06 | 23.44 | 28.1 | 28.13 |
| 130 | 11.07 | 11.08 | 11.54 | 13.83 | 13.85 | 23.08 | 27.66 | 27.69 |
| 140 | 10.28 | 10.29 | 10.71 | 12.84 | 12.86 | 21.43 | 25.69 | 25.71 |
| 150 | 9.59 | 9.6 | 10 | 11.99 | 12 | 20 | 23.98 | 24 |
| 160 | 8.99 | 9 | 9.38 | 11.24 | 11.25 | 18.75 | 22.48 | 22.5 |
| 170 | 8.46 | 8.47 | 8.82 | 10.58 | 10.59 | 17.65 | 21.16 | 21.18 |
| 174 | 8.27 | 8.28 | 8.62 | 10.33 | 10.34 | 17.24 | 20.67 | 20.69 |
| 180 | 7.99 | 8 | 8.33 | 9.99 | 10 | 16.67 | 19.98 | 20 |

Don't know the tempo? Find it from the file with the
[video BPM finder](/video-bpm), from a song with the
[BPM finder](/), or [tap it](/tap-tempo).

For a marker on every beat in your editor, drop the file on the
[video BPM finder](/video-bpm#export-beat-markers) and export beat markers. They
suit songs with a steady tempo.

## Frequently asked questions

<ToolFaq />

## More free tools

<div class="tt-tools">
  <a class="tt-tool" href="/video-bpm"><strong>Video BPM Finder</strong><span>Find the tempo of the music in a video file</span></a>
  <a class="tt-tool" href="/bpm-to-ms"><strong>BPM to ms</strong><span>Delay and reverb times for every note value</span></a>
  <a class="tt-tool" href="/tap-tempo"><strong>Tap Tempo</strong><span>Tap along to measure any tempo</span></a>
</div>
