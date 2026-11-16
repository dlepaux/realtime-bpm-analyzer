<script setup lang="ts">
import type { Reading } from 'realtime-bpm-analyzer';
import './panels.css';

/**
 * The reading panel: every field a v6 reading has. A file analysed offline and a live reading are the same
 * `Reading` type, so the same panel shows both.
 */
defineProps<{
  reading: Reading;
  /** The analyzer's status while it reads live; offline there is none. */
  status?: 'settling' | 'locked';
}>();
</script>

<template>
  <section class="reading-panel">
    <!-- bpm is for display; bpmExact is the same tempo unrounded, for timing work -->
    <div :class="['bpm-display', { settling: status === 'settling' }]">
      <div class="bpm-value">{{ reading.bpm }}</div>
      <div class="bpm-label">{{ status === undefined ? 'BPM' : `BPM · ${status}` }}</div>
    </div>

    <dl class="reading-fields">
      <dt>Exact tempo</dt>
      <dd>{{ reading.bpmExact.toFixed(2) }} BPM</dd>
      <dt>Confidence</dt>
      <dd>{{ reading.confidence === null ? 'unmeasured' : reading.confidence.toFixed(2) }}</dd>
      <!-- candidates[0] is the reading's own tempo; the others are labelled half, double or other -->
      <dt>Candidates</dt>
      <dd>{{ reading.candidates.map(({ bpm, relation }) => `${bpm} (${relation})`).join(', ') }}</dd>
      <dt>Audio</dt>
      <dd>{{ reading.audio.from.toFixed(1) }} s to {{ reading.audio.to.toFixed(1) }} s, {{ reading.engine }} engine</dd>
    </dl>

    <p class="confidence-meaning">
      Confidence is the library's estimate, from 0 to 1, of the chance that this BPM is right. It is unmeasured (null) for a reading outside 90 to 180 BPM, or from an analysis on a custom tempoRange.
    </p>
  </section>
</template>
