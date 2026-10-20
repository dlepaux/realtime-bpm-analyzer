---
title: Online Metronome — Free, Accurate, With Subdivisions
description: Free online metronome from 20 to 300 BPM, with accented downbeats, 1 to 12 beats per bar, eighth, triplet and sixteenth subdivisions, and tap to set the tempo.
aside: false
editLink: false
tool:
  name: Online Metronome
  featureList:
    - 20 to 300 BPM, sample-accurate Web Audio timing
    - 1 to 12 beats per bar with an optional accented downbeat
    - Quarter, eighth, triplet and sixteenth subdivisions
    - Tap to set the tempo, keyboard shortcuts, keeps the screen awake
faq:
  - q: Is this online metronome accurate?
    a: Yes. Every click is scheduled ahead of time on the Web Audio clock, which runs on the audio hardware's own sample clock, so clicks land on time even when the page is busy. Timers only decide when to book the next clicks; they never time the sound.
  - q: How do I set the tempo?
    a: Drag the slider, use the minus and plus buttons, or press the arrow keys (hold Shift for steps of 10). To match a song, tap the Tap button or press T in time with it and the metronome adopts the tempo after three taps.
  - q: How do I practise triplets or sixteenth notes?
    a: Choose a subdivision. The metronome adds quieter, lower clicks between the beats, two per beat for eighths, three for triplets and four for sixteenths, while the beat itself stays louder.
  - q: Why is there no sound on my iPhone?
    a: iOS mutes web audio when the ringer switch is set to silent. Flip the switch off silent, raise the volume and press Start again.
  - q: What do Largo, Andante and Allegro mean?
    a: They are classical tempo markings. Roughly, Largo is 40 to 60 BPM, Adagio 66 to 76, Andante 76 to 108, Moderato 108 to 120, Allegro 120 to 156 and Presto 176 to 200. The metronome shows the marking for the current tempo.
---

<script setup>
import Metronome from './.vitepress/components/Metronome.vue'
import ToolFaq from './.vitepress/components/ToolFaq.vue'
</script>

# Online Metronome

A free metronome that keeps sample-accurate time in your browser. Set the
tempo, pick a time signature and a subdivision, and press **Start** or
**Space**.

<Metronome />

## Built for practice

- **Accurate timing.** Clicks are booked on the audio clock about a tenth of
  a second ahead, so a busy page cannot make them drift.
- **Any meter.** 1 to 12 beats per bar, with the first beat accented or not.
- **Subdivisions.** Hear eighths, triplets or sixteenths between the beats.
- **Tap to set.** Tap along with a recording and the metronome follows.
- **Stays awake.** On phones that support it, the screen stays on while the
  metronome runs.

Need the tempo of a recording? [Tap it](/tap-tempo), or detect it
automatically with the [BPM Analyzer](/). Setting up a delay to match? Use the
[BPM to ms calculator](/bpm-to-ms).

## Frequently asked questions

<ToolFaq />

## More free tools

<div class="tt-tools">
  <a class="tt-tool" href="/"><strong>BPM Analyzer</strong><span>Detect the tempo of a file, the mic or a stream</span></a>
  <a class="tt-tool" href="/tap-tempo"><strong>Tap Tempo</strong><span>Tap along to measure any tempo</span></a>
  <a class="tt-tool" href="/bpm-to-ms"><strong>BPM to ms</strong><span>Delay and reverb times for every note value</span></a>
</div>
