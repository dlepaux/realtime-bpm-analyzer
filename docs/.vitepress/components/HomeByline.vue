<script setup lang="ts">
// The home page's byline: who maintains the tool, and when the page last changed. The
// date is the page's git date, rendered on the server like the guides' "Last updated".
import { computed } from 'vue'
import { useData } from 'vitepress'
import { isoDate, readableDate } from '../tools/site-schema'

const { page } = useData()
const iso = computed(() => isoDate(page.value.lastUpdated))
const readable = computed(() => readableDate(page.value.lastUpdated))
</script>

<template>
  <p class="home-byline">
    Maintained by <a href="https://david.lepaux.com">David Lepaux</a><template v-if="readable">.
      Last updated <time :datetime="iso">{{ readable }}</time></template>.
  </p>
</template>

<style scoped>
.home-byline {
  font-size: 14px;
  color: var(--vp-c-text-2);
}
</style>
