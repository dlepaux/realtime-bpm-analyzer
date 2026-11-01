<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  REEL_CROP_WIDTHS,
  REEL_DIR,
  REEL_MAX_DISPLAY_WIDTH,
  REEL_PAGE,
  REEL_STEPS,
  REEL_WIDE_WIDTHS,
  REEL_ZOOM,
  reelFile,
  type ReelCapture,
  type ReelStep,
  type ReelTheme,
} from '../tools/extension-reel'

// Real frames of one real session on a real YouTube page, with the zoom added in CSS and
// nothing retouched. It loops for as long as it's on screen, so it has a pause button
// (WCAG 2.2.2); without motion it is the stable frame, still. All images are lazy, because
// that is what stops a hidden theme's images from loading at all.
const props = defineProps<{ capture: ReelCapture }>()

const THEMES: readonly ReelTheme[] = ['light', 'dark']
const SIZES = `(min-width: ${REEL_MAX_DISPLAY_WIDTH}px) ${REEL_MAX_DISPLAY_WIDTH}px, 100vw`
const paused = ref(false)
const STAGE_VARS = {
  '--ext-reel-zoom': REEL_ZOOM,
  '--ext-reel-ratio': `${REEL_PAGE.width} / ${REEL_PAGE.height}`,
}

type Widths = readonly [number, number]
const srcset = (theme: ReelTheme, layer: 'wide' | ReelStep, widths: Widths) =>
  widths.map((width) => `/${REEL_DIR}/${reelFile(theme, layer, width)} ${width}w`).join(', ')
const src = (theme: ReelTheme, layer: 'wide' | ReelStep, widths: Widths) =>
  `/${REEL_DIR}/${reelFile(theme, layer, widths[1])}`

const label = computed(() =>
  `A YouTube watch page playing a synthwave production video. The view moves in on the top right of the player, where the extension's display listens, settles, then shows ${props.capture.bpm} BPM, stable.`)
</script>

<template>
  <figure
    class="ext-stage-figure ext-reel"
    :class="{ 'is-paused': paused }"
  >
    <div
      class="ext-reel-stage"
      role="img"
      :aria-label="label"
      :style="STAGE_VARS"
    >
      <div
        v-for="theme in THEMES"
        :key="theme"
        class="ext-reel-camera"
        :data-look="theme"
      >
        <img
          class="ext-reel-wide"
          loading="lazy"
          :src="src(theme, 'wide', REEL_WIDE_WIDTHS)"
          :srcset="srcset(theme, 'wide', REEL_WIDE_WIDTHS)"
          :sizes="SIZES"
          :width="REEL_PAGE.width"
          :height="REEL_PAGE.height"
          alt=""
          decoding="async"
        />
        <img
          v-for="step in REEL_STEPS"
          :key="step"
          class="ext-reel-crop"
          :data-step="step"
          loading="lazy"
          :src="src(theme, step, REEL_CROP_WIDTHS)"
          :srcset="srcset(theme, step, REEL_CROP_WIDTHS)"
          :sizes="SIZES"
          :width="REEL_PAGE.width"
          :height="REEL_PAGE.height"
          alt=""
          decoding="async"
        />
      </div>
    </div>
    <figcaption class="ext-reel-caption">
      <span>
        Sped up and zoomed. A tempo takes a few seconds to appear and longer to settle. Video:
        <a
          :href="capture.video.url"
          rel="noopener"
        >{{ capture.video.title }}</a>
        by {{ capture.video.channel }}, CC BY. Not affiliated with or endorsed by YouTube.
      </span>
      <button
        class="ext-reel-pause"
        type="button"
        @click="paused = !paused"
      >
        {{ paused ? 'Play' : 'Pause' }}
      </button>
    </figcaption>
  </figure>
</template>
