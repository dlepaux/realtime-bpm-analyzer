<script setup lang="ts">
import { STORE_URL } from '../tools/extension-live'
import { EXTENSION_PAGE } from '../tools/extension-promo'

// One sentence for a tool page, in the page's own text so it never competes with the
// tool, and in that tool's terms. Renders nothing until the extension has a listing. It
// links to the page rather than the store: someone reading a tool's page hasn't heard
// of the extension yet.
defineProps<{ lead: string; tail: string }>()
</script>

<template>
  <p v-if="STORE_URL">
    {{ lead }} <a :href="EXTENSION_PAGE">Live BPM Detector</a> {{ tail }}
  </p>
</template>
