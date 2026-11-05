<script setup lang="ts">
import { READINGS, SCENES, anchorTransform } from '../tools/extension-scenes'

// The extension's overlay as the demo draws it: the same elements, class names and state
// attributes as rba-pro's extension/src/overlay/view.ts, and extension-scenes.test.ts pins them. It renders
// the stable state in normal flow, which is the still. Everything the real one reflows for, this
// layers and moves with transforms, so its states never touch the page's layout.
const [FIRST] = SCENES
const ANCHOR = anchorTransform(FIRST.anchor)
</script>

<template>
  <div
    class="ext-sw-pos"
    :style="{ transform: ANCHOR }"
  >
    <div class="ext-sw">
      <div class="pill">
        <span class="ext-pill-shell"><i class="ext-pill-body"></i><i class="ext-pill-edge"></i></span>
        <span class="stack">
          <span class="reading"><span
            class="value"
            data-state="tempo"
          ><span
            v-for="reading in READINGS"
            :key="reading"
            class="num"
            :data-reading="reading"
            :data-shown="reading === FIRST.bpm"
          >{{ reading }}</span><span class="dots"><span>.</span><span>.</span><span>.</span></span></span> <span class="unit">BPM</span></span>
          <span
            class="hint"
            data-stability="stable"
            data-level="high"
          ><span class="dot"></span><span class="label">stable</span></span>
          <span
            class="hint ext-hint-layer"
            data-stability="settling"
            data-level="medium"
          ><span class="dot"></span><span class="label">settling</span></span>
        </span>
        <span class="close">✕</span>
        <span
          class="progress"
          data-level="high"
        ><span class="ext-fill-track"><span class="fill"></span><i
          class="ext-fill-layer"
          data-level="medium"
        ></i><i
          class="ext-fill-layer"
          data-level="low"
        ></i></span></span>
      </div>
    </div>
  </div>
</template>
