<script setup lang="ts">
import type { Kick } from 'realtime-bpm-analyzer';
import './kick-panel.css';

/**
 * The kick panel: each `kick` event as it comes, newest first, with its time on the audio clock and its strength.
 * From the microphone, the room heard each kick just before its event fired, so the panel shows it at once.
 */
defineProps<{
  /** Newest first */
  kicks: readonly Kick[];
  count: number;
}>();
</script>

<template>
  <section class="kick-panel">
    <h2>Kicks</h2>
    <p class="kick-count">{{ count }} heard</p>
    <ul class="kick-list">
      <!-- A kick's context time is unique: two kicks are at least 80 ms apart -->
      <li v-for="kick in kicks" :key="kick.contextTime">
        <span>{{ kick.contextTime.toFixed(3) }} s</span>
        <span>{{ kick.strength.toFixed(2) }}</span>
        <meter class="kick-strength" :min="0" :max="1" :value="kick.strength" aria-label="Strength" />
      </li>
    </ul>
    <p class="kick-meaning">
      Time is on the AudioContext clock. Strength runs from 0 to 1, against the loudest kick of the last few seconds.
    </p>
  </section>
</template>
