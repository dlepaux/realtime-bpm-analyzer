<script setup lang="ts">
// Replaces VitePress's VPDocFooterLastUpdated (see the alias in config.ts). The date is
// formatted in UTC, the same on the server and in the browser, so it ships in the
// prerendered HTML instead of appearing only once JavaScript runs.
import { computed } from 'vue'
import { useData } from 'vitepress'
import { isoDate, readableDate } from '../tools/site-schema'

const { theme, page } = useData()
const label = computed(() => theme.value.lastUpdated?.text || 'Last updated')
const iso = computed(() => isoDate(page.value.lastUpdated))
const readable = computed(() => readableDate(page.value.lastUpdated))
</script>

<template>
  <p
    v-if="readable"
    class="VPLastUpdated"
  >
    {{ label }}: <time :datetime="iso">{{ readable }}</time>
  </p>
</template>

<style scoped>
.VPLastUpdated {
  line-height: 24px;
  font-size: 14px;
  font-weight: 500;
  color: var(--vp-c-text-2);
}

@media (min-width: 640px) {
  .VPLastUpdated {
    line-height: 32px;
  }
}
</style>
