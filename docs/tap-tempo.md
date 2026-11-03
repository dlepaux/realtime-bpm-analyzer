---
title: Tap Tempo — Tap Along to Find the BPM
description: Free online tap tempo tool. Tap any key or the pad in time with the music to find its BPM, with millisecond precision and a live steadiness score. No sign-up.
aside: false
editLink: false
tool:
  name: Tap Tempo
  featureList:
    - Tap with a mouse, a touchscreen or the keyboard (Space, Enter or T)
    - Tempo from a least-squares fit over the last 16 taps
    - Decimal BPM, milliseconds per beat and a steadiness score
    - Sends the result to the BPM to ms calculator and the metronome
faq:
  - q: How do I find the BPM of a song by tapping?
    a: Play the song and tap the pad, or press Space, on every beat. After four taps the BPM settles; keep tapping for eight to sixteen beats for a precise reading. The steadiness score tells you how even your taps are.
  - q: How accurate is tap tempo?
    a: It is as accurate as your timing. The tool fits a line through every tap instead of trusting the last interval, so with sixteen steady taps one early or late tap barely moves the result.
  - q: Why does my BPM come out half or double?
    a: You tapped every other beat, or every off-beat as well. Both are valid readings of the same tempo. Most dance music sits between 90 and 180 BPM, so halve or double into that range if the number looks off.
  - q: How do I start over?
    a: Press Escape or the Reset button, or simply pause for three seconds. The next tap starts a new measurement.
  - q: Can I find the BPM without tapping?
    a: Yes. The BPM Analyzer on the home page detects the tempo automatically from an audio file, your microphone or a live radio stream, entirely in your browser.
---

<script setup>
import TapTempo from './.vitepress/components/TapTempo.vue'
import ToolFaq from './.vitepress/components/ToolFaq.vue'
import ExtensionMention from './.vitepress/components/ExtensionMention.vue'
</script>

# Tap Tempo

Tap the pad, or press **Space**, in time with the music. The tool turns your
taps into beats per minute (BPM) as you go and tells you how steady they are.

<TapTempo />

## How tap tempo works

Each tap is timestamped to a fraction of a millisecond. Rather than averaging
the gaps between taps, the tool fits a straight line through the last 16 taps
(least squares). The slope of that line is the length of one beat, and

**BPM = 60,000 ÷ milliseconds per beat**

so a beat of 500 ms is 120 BPM. Because every tap pulls on the line, one tap
that lands early or late shifts the result far less than it would in a simple
average. The steadiness score is the spread of your tap intervals: under ±2%
is rock steady.

Prefer not to tap? The [BPM Analyzer](/) finds the tempo automatically from a
file, your microphone or a radio stream.

<ExtensionMention />

## Frequently asked questions

<ToolFaq />

## More free tools

<div class="tt-tools">
  <a class="tt-tool" href="/"><strong>BPM Analyzer</strong><span>Detect the tempo of a file, the mic or a stream</span></a>
  <a class="tt-tool" href="/bpm-to-ms"><strong>BPM to ms</strong><span>Delay and reverb times for every note value</span></a>
  <a class="tt-tool" href="/metronome"><strong>Metronome</strong><span>Accents, subdivisions and tap to set</span></a>
</div>
