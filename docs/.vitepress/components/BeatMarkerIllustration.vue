<script setup lang="ts">
// Our own drawing of what the export gives (RBA-116): a song on a timeline, a marker on each beat
// and the video cut on the markers. No editor's interface and no logo (DECISION 2026-11-15 on
// RBA-116), and the caption says it is an illustration, as the extension's scenes do on the home.
// The caption carries the meaning, so the drawing is hidden from screen readers.

const WIDTH = 640
const BEAT_SPACING = 64
const FIRST_BEAT = 48
const BEATS = Array.from({ length: 9 }, (_, index) => FIRST_BEAT + index * BEAT_SPACING)

// A waveform that peaks on each beat and decays until the next, so the markers visibly sit on
// the hits. Rounded to a tenth, so the prerendered SVG stays small and no engine's last digit of
// Math.exp or Math.sin can tell the server's numbers from the browser's.
const BAR_STEP = 6
const BAR_DECAY_PX = 14
const AUDIO_MID = 136
const AUDIO_HALF = 28
const bars = Array.from({ length: Math.floor((WIDTH - 32) / BAR_STEP) }, (_, index) => {
  const x = 16 + index * BAR_STEP
  const sinceBeat = (x - FIRST_BEAT + BEAT_SPACING * 4) % BEAT_SPACING
  const level = 0.18 + 0.82 * Math.exp(-sinceBeat / BAR_DECAY_PX) + 0.08 * Math.abs(Math.sin(index * 1.7))
  const half = Math.min(1, level) * AUDIO_HALF
  const tenth = (value: number) => Math.round(value * 10) / 10
  return { x, y: tenth(AUDIO_MID - half), height: tenth(half * 2) }
})

// The video track: clips cut on every second marker, as an edit to the beat would be.
const clips = BEATS.slice(0, -1).filter((_, index) => index % 2 === 0)
  .map((start) => ({ x: start + 1, width: BEAT_SPACING * 2 - 2 }))
</script>

<template>
  <figure class="beat-markers-figure">
    <svg
      :viewBox="`0 0 ${WIDTH} 184`"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        class="bm-track"
        x="8"
        y="40"
        :width="WIDTH - 16"
        height="52"
        rx="6"
      />
      <rect
        class="bm-track"
        x="8"
        y="104"
        :width="WIDTH - 16"
        height="64"
        rx="6"
      />
      <rect
        v-for="clip in clips"
        :key="clip.x"
        class="bm-clip"
        :x="clip.x"
        y="46"
        :width="clip.width"
        height="40"
        rx="4"
      />
      <rect
        v-for="bar in bars"
        :key="bar.x"
        class="bm-wave"
        :x="bar.x"
        :y="bar.y"
        width="3"
        :height="bar.height"
        rx="1.5"
      />
      <g
        v-for="beat in BEATS"
        :key="beat"
      >
        <line
          class="bm-guide"
          :x1="beat"
          :x2="beat"
          y1="28"
          y2="172"
        />
        <path
          class="bm-marker"
          :d="`M${beat - 7} 8h14v12l-7 7l-7 -7z`"
        />
      </g>
    </svg>
    <figcaption>
      Illustration of a timeline, not an editor's screen: a marker on every beat of the song, and
      the video cut on the markers.
    </figcaption>
  </figure>
</template>

<style scoped>
.beat-markers-figure { margin: 1.5rem 0; }

.beat-markers-figure svg {
  display: block;
  width: 100%;
  height: auto;
  padding: 0.75rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
  background: var(--vp-c-bg-soft);
}

.bm-track { fill: var(--vp-c-bg); stroke: var(--vp-c-divider); }
.bm-clip { fill: var(--vp-c-brand-soft); stroke: var(--vp-c-brand-1); stroke-width: 1; }
.bm-wave { fill: var(--vp-c-text-3); }
.bm-guide { stroke: var(--vp-c-brand-1); stroke-width: 1; stroke-dasharray: 3 4; opacity: 0.6; }
.bm-marker { fill: var(--vp-c-brand-1); }

.beat-markers-figure figcaption {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--vp-c-text-2);
}
</style>
