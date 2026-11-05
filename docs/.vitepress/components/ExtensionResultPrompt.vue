<script setup lang="ts">
import { useAnalytics } from '../composables/useAnalytics'
import { STORE_URL } from '../tools/extension-live'
import { EXTENSION_PAGE } from '../tools/extension-promo'

// Offered only once the visitor has their tempo, never while they are getting it (Flow), and only
// on a computer, the one place it can be installed. Its parent decides the moment, CSS the device.
const props = defineProps<{ source: 'mic' | 'stream' }>()

const { track } = useAnalytics()
const onClick = () => track('extension_link_clicked', { placement: `result_${props.source}`, target: 'page' })
</script>

<template>
  <p
    v-if="STORE_URL"
    class="ext-result-prompt"
  >
    Music in a Chrome tab next time? <a
      :href="EXTENSION_PAGE"
      @click="onClick"
    >Live BPM Detector</a> shows its tempo on the page.
  </p>
</template>
