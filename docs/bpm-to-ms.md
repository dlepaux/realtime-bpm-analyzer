---
title: BPM to ms Calculator — Delay and Reverb Times
description: Convert BPM to milliseconds for every note value, straight, dotted and triplet, to set delay and reverb times in sync. Also converts ms back to BPM and shows Hz.
aside: false
editLink: false
tool:
  name: BPM to ms Calculator
  featureList:
    - Milliseconds or hertz for whole notes down to 1/64 notes
    - Straight, dotted and triplet values side by side
    - Click any value to copy it
    - Converts a delay time in ms back to BPM
faq:
  - q: How do I convert BPM to milliseconds?
    a: Divide 60,000 by the BPM. The result is the length of one quarter note in milliseconds. At 120 BPM a quarter note lasts 60,000 ÷ 120 = 500 ms, an eighth note 250 ms and a sixteenth note 125 ms.
  - q: How do I calculate a dotted or triplet delay time?
    a: Multiply the straight note value by 1.5 for a dotted note, or by 2/3 for a triplet. At 120 BPM a straight eighth is 250 ms, a dotted eighth 375 ms and an eighth-note triplet 166.67 ms.
  - q: What delay time should I use for a vocal?
    a: A dotted eighth or a quarter note is the classic starting point, because the repeats land between the beats without cluttering them. At 128 BPM that is 351.56 ms dotted or 468.75 ms straight.
  - q: How do I convert milliseconds back to BPM?
    a: Divide 60,000 by the milliseconds, assuming the time is one quarter note. A 400 ms quarter note is 150 BPM. Type the delay time into the calculator to see it as a quarter, an eighth and a dotted eighth.
  - q: Why show hertz?
    a: Hertz is the rate of an LFO, such as a tremolo or an auto-pan, that cycles once per note. It is 1,000 divided by the note length in milliseconds, so a 500 ms quarter note is 2 Hz.
---

<script setup>
import BpmToMs from './.vitepress/components/BpmToMs.vue'
import ToolFaq from './.vitepress/components/ToolFaq.vue'
</script>

# BPM to ms Calculator

Type a tempo and get the length of every note value, in milliseconds or hertz,
ready to paste into a delay, reverb pre-delay, compressor release or LFO.
Click any value to copy it.

<BpmToMs />

## The formula

One beat is a quarter note, and one minute is 60,000 milliseconds, so:

- **Quarter note (ms) = 60,000 ÷ BPM**
- **Dotted note = straight note × 1.5**
- **Triplet note = straight note × 2/3**
- **Rate (Hz) = 1,000 ÷ note length (ms)**

Halve the quarter note for an eighth, halve again for a sixteenth, and double
it for a half note.

## BPM to ms chart

Common tempos, in milliseconds:

| BPM | 1/4 | 1/8 | 1/8 dotted | 1/8 triplet | 1/16 | 1 bar (4/4) |
|---:|---:|---:|---:|---:|---:|---:|
| 60 | 1000 | 500 | 750 | 333.33 | 250 | 4000 |
| 70 | 857.14 | 428.57 | 642.86 | 285.71 | 214.29 | 3428.57 |
| 80 | 750 | 375 | 562.5 | 250 | 187.5 | 3000 |
| 90 | 666.67 | 333.33 | 500 | 222.22 | 166.67 | 2666.67 |
| 100 | 600 | 300 | 450 | 200 | 150 | 2400 |
| 110 | 545.45 | 272.73 | 409.09 | 181.82 | 136.36 | 2181.82 |
| 120 | 500 | 250 | 375 | 166.67 | 125 | 2000 |
| 124 | 483.87 | 241.94 | 362.9 | 161.29 | 120.97 | 1935.48 |
| 128 | 468.75 | 234.38 | 351.56 | 156.25 | 117.19 | 1875 |
| 130 | 461.54 | 230.77 | 346.15 | 153.85 | 115.38 | 1846.15 |
| 140 | 428.57 | 214.29 | 321.43 | 142.86 | 107.14 | 1714.29 |
| 150 | 400 | 200 | 300 | 133.33 | 100 | 1600 |
| 160 | 375 | 187.5 | 281.25 | 125 | 93.75 | 1500 |
| 170 | 352.94 | 176.47 | 264.71 | 117.65 | 88.24 | 1411.76 |
| 174 | 344.83 | 172.41 | 258.62 | 114.94 | 86.21 | 1379.31 |
| 180 | 333.33 | 166.67 | 250 | 111.11 | 83.33 | 1333.33 |

Don't know the tempo? [Tap it](/tap-tempo), or let the [BPM Analyzer](/)
detect it from the track itself.

## Frequently asked questions

<ToolFaq />

## More free tools

<div class="tt-tools">
  <a class="tt-tool" href="/"><strong>BPM Analyzer</strong><span>Detect the tempo of a file, the mic or a stream</span></a>
  <a class="tt-tool" href="/tap-tempo"><strong>Tap Tempo</strong><span>Tap along to measure any tempo</span></a>
  <a class="tt-tool" href="/metronome"><strong>Metronome</strong><span>Accents, subdivisions and tap to set</span></a>
</div>
