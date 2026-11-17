<script setup lang="ts">
import { computed } from 'vue';
import type { AnalyzerError, AnalyzerState, StateChange } from 'realtime-bpm-analyzer';
import './panels.css';

/**
 * The state panel: what the analyzer is doing (`analyzer.state`), its last state changes, and the last
 * non-fatal error.
 */
const props = defineProps<{
  state: AnalyzerState;
  /** Newest first */
  changes: readonly StateChange[];
  lastError: AnalyzerError | null;
}>();

const detail = computed(() => describe(props.state));

function describe(state: AnalyzerState): string {
  switch (state.status) {
    case 'listening':
      return `${state.reason}, ${Math.round(state.progress * 100)}% to the first reading · epoch ${state.epoch}`;
    case 'settling':
      return `readings are coming, not yet in agreement · epoch ${state.epoch}`;
    case 'locked':
      return `the readings agree · epoch ${state.epoch}`;
    case 'stopped':
      // error is set only when a fatal fault stopped the analyzer
      return state.error === null ? 'stopped by the page' : `${state.error.name}: ${state.error.message}`;
  }
}
</script>

<template>
  <section class="state-panel">
    <div class="state-row">
      <span :class="['state-badge', state.status]">{{ state.status }}</span>
      <span class="state-detail">{{ detail }}</span>
    </div>

    <!-- While listening, progress runs from 0 to 1 toward the first reading -->
    <progress v-if="state.status === 'listening'" class="state-progress" :max="1" :value="state.progress" />

    <p class="state-changes-title">State changes, newest first</p>
    <ol class="state-changes">
      <li v-for="(change, index) in changes" :key="index">
        {{ `${change.from.status} → ${change.to.status} (${change.reason})` }}
      </li>
    </ol>

    <p v-if="lastError" class="analysis-error">Last error: {{ lastError.name }}, {{ lastError.message }}</p>
  </section>
</template>
