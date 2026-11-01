<script setup lang="ts">
import ExtensionPill from './ExtensionPill.vue'

// The product working, drawn with the real overlay's anatomy on a made-up tab. CSS only,
// so it runs without JavaScript and weighs no image. With `live` it plays once and rests
// on the stable reading; a loop beside the install button would compete with it, and
// would need a pause control. Reduced motion, and print, get only the rest state. The
// real overlay takes longer to reach stable, which the page's caption says.
withDefaults(defineProps<{ live?: boolean; title?: boolean }>(), { live: false, title: true })

// Bar heights for the made-up audio, fixed so server and client render the same.
const BARS = [30, 52, 40, 68, 46, 82, 58, 36, 72, 50, 90, 44, 64, 34, 78, 54, 42, 86, 48, 60, 38, 74, 56, 32, 66, 80, 44, 58]
</script>

<template>
  <div
    class="ext-demo"
    :class="{ 'is-live': live }"
    role="img"
    aria-label="Illustration on a made-up video page: the extension's display sits at the top right of the player and shows 120 BPM, stable. The reading is an example."
  >
    <div
      class="ext-demo-bar"
      aria-hidden="true"
    >
      <span class="ext-demo-address">A made-up video page</span>
      <span class="ext-demo-button">
        <img
          src="/logo.svg"
          alt=""
          width="18"
          height="18"
        />
        <span class="ext-demo-badge">120</span>
      </span>
    </div>
    <div
      class="ext-demo-video"
      aria-hidden="true"
    >
      <div class="ext-demo-wave">
        <span
          v-for="(height, index) in BARS"
          :key="index"
          :style="{ height: `${height}%` }"
        ></span>
      </div>
      <div class="ext-demo-scrub"></div>
      <div class="ext-demo-pills">
        <ExtensionPill stability="listening" />
        <ExtensionPill
          bpm="120"
          stability="settling"
        />
        <ExtensionPill
          bpm="120"
          stability="stable"
        />
      </div>
    </div>
    <div
      class="ext-demo-meta"
      aria-hidden="true"
    >
      <div
        v-if="title"
        class="ext-demo-title"
      >
        Harbour Lights, live session
      </div>
      <div class="ext-demo-sub">
        Example reading: 120 BPM
      </div>
    </div>
  </div>
</template>
