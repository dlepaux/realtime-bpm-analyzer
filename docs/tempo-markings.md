---
title: Tempo Markings and Genre BPM Chart
description: Italian tempo markings from grave to prestissimo and common genre tempos in BPM, each range with its source. Every row plays on the metronome.
aside: false
editLink: false
pageClass: tempo-chart-page
---

<script setup>
import TempoChart from './.vitepress/components/TempoChart.vue'
import TempoChartSources from './.vitepress/components/TempoChartSources.vue'
</script>

# Tempo Markings Chart

A tempo marking tells you how fast to play. The Italian terms run from grave,
very slow, to prestissimo, as fast as possible, and each one covers a span of
tempos rather than a single number. This chart gives each term's range in beats
per minute (BPM) as each source gives it, then a tempo to start from. Press
**Play** on any row to hear it on the [metronome](/metronome), or
**Delay times** for its note lengths in milliseconds.

## Italian tempo terms

From slowest to fastest. **Plays at** is a tempo inside the ranges most of the
sources share. If the score has a metronome mark, play that instead: the
composer's own number comes before any chart.

<TempoChart section="italian" />

### Where the sources disagree

The sources agree on the order of the terms far more than on their numbers.

- **Adagio:** Wikipedia gives 44 to 66, Lumen 55 to 65 and Dolmetsch 58 to 97.
  Dolmetsch adds that other sources give 66 to 76, or 48 to 66.
- **Moderato:** Wikipedia gives 108 to 120, while Lumen gives 86 to 97.
  Dolmetsch spans both, from 66 to 126.
- **Vivace:** about 140 in Dolmetsch and 132 to 140 in Lumen, but 156 to 176
  in Wikipedia, which puts it above allegro.
- **Presto:** Wikipedia and Lumen start it at 168. Dolmetsch gives 100 to 152,
  and notes that some sources suggest 168 to 208.

### The terms changed over time

These words are older than the metronome, and their meaning moved.

- **Largo** was faster than adagio in the Baroque period. Today it is the
  slower of the two (Wikipedia).
- **Allegretto** first meant a little faster than andante. By the
  mid-19th century it sat just below allegro (Wikipedia).
- **Andantino** reads as a little faster than andante to some musicians and a
  little slower to others. Dolmetsch calls the result "not a little confusion".
- **Andante** itself moved: Beethoven "decided that more andante was faster"
  (Dolmetsch).

## Common tempos by genre

Genres overlap, and producers bend them all the time. These are the tempos
most tracks in each style sit in.

<TempoChart section="genre" />

### Half time

Dubstep and trap usually sit around 140 BPM, but the snare lands on beat 3
rather than on 2 and 4, so the beat feels like 70. Wikipedia gives trap as 50
to 88 counted in half time, which is 100 to 176 in full. Drum and bass at 174
often feels like 87 for the same reason. The **feels like** number opens the
metronome at the half-time tempo.

If a tap or the [BPM Analyzer](/) gives you half or double the number you
counted, both readings can be right: they count the same beat at two levels.

## What tempo is my piece?

Tap along with a recording on [Tap Tempo](/tap-tempo) and it reads the tempo
from your taps, or let the [BPM Analyzer](/) find it in an audio file. Then
look for the term above whose ranges hold that number.

## Printing the chart

Print this page from your browser. The site's menus and the Play buttons drop
out, and the sources print with their web addresses.

## Sources

Each figure in the chart is the one its source gives. Where a source gives a
single tempo, the chart shows that number.

<TempoChartSources />
