<script setup lang="ts">
import { useAnalytics } from '../composables/useAnalytics'
import ExtensionScenes from './ExtensionScenes.vue'
import { EXTENSION_PAGE } from '../tools/extension-promo'

// The home page's door to the extension, beside the analyzer's. Its button goes to the
// page, which explains Chrome's install prompt before anyone meets it. It moves beside the
// analyzer because David asked for the product shown working on the first screen; the demo
// has its own pause button.
const { track } = useAnalytics()
</script>

<template>
  <section class="ext-door ext-band">
    <h2>Playing on YouTube or SoundCloud?</h2>
    <p class="ext-door-line">
      A free Chrome extension shows the live BPM right on the page, on YouTube, SoundCloud and more.
      Your audio never leaves your device.
    </p>
    <a
      class="ext-cta"
      :href="EXTENSION_PAGE"
      @click="track('extension_link_clicked', { placement: 'home_door', target: 'page' })"
    >Live BPM Detector for Chrome</a>
    <ExtensionScenes />
  </section>
</template>
