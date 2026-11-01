<script setup lang="ts">
import ExtensionDemo from './ExtensionDemo.vue'
import ExtensionReel from './ExtensionReel.vue'
import { REEL_CAPTURE } from '../tools/extension-reel-capture'

// What the extension's first screens show: the real session once its frames exist, the
// labelled illustration until then (RBA-58). Nothing else on the site knows which.
defineProps<{ live?: boolean }>()
</script>

<template>
  <ExtensionReel
    v-if="REEL_CAPTURE"
    :capture="REEL_CAPTURE"
  />
  <figure
    v-else
    class="ext-stage-figure"
  >
    <ExtensionDemo :live="live" />
    <figcaption>Illustration: a made-up page, enlarged and sped up. A real tempo takes a few seconds to appear and longer to settle.</figcaption>
  </figure>
</template>
