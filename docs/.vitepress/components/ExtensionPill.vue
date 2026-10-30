<script setup lang="ts">
// A static picture of the extension's overlay pill (rba-pro extension/src/overlay/view.ts),
// drawn with the same colours so the welcome page shows what will appear on the player.
// `intro` plays the one moment the welcome page animates: the line fills while it
// listens, then the tempo locks. It is CSS only, so it runs without JavaScript, and
// under reduced motion the pill simply shows the locked state.
withDefaults(defineProps<{
  bpm?: string
  stability?: 'settling' | 'stable'
  intro?: boolean
}>(), { bpm: '128', stability: 'stable', intro: false })
</script>

<template>
  <span
    class="ext-pill"
    :class="{ 'is-intro': intro }"
    :data-stability="stability"
    role="img"
    :aria-label="`The extension's display: ${bpm} BPM, ${stability}`"
  >
    <span class="ext-pill-stack">
      <span class="ext-pill-reading">
        <span class="ext-pill-value">
          <span class="ext-pill-num">{{ bpm }}</span>
          <span
            v-if="intro"
            class="ext-pill-dots"
          ><span>.</span><span>.</span><span>.</span></span>
        </span>
        <span class="ext-pill-unit">BPM</span>
      </span>
      <span class="ext-pill-hint">
        <span class="ext-pill-dot"></span>
        <span class="ext-pill-label">{{ stability }}</span>
      </span>
    </span>
    <span class="ext-pill-close">✕</span>
    <span class="ext-pill-progress"><span class="ext-pill-fill"></span></span>
  </span>
</template>
