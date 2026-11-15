<script setup lang="ts">
import { READ_ON, SOURCES, type SourceId } from '../tools/tempo-chart'

// The tempo chart's sources list (RBA-209), printed from the same data as the tables, so every
// source a cell names has an entry here for its link to land on.
const sources = Object.entries(SOURCES) as [SourceId, (typeof SOURCES)[SourceId]][]
</script>

<template>
  <ol class="tc-sources">
    <li v-for="[id, source] in sources" :id="`source-${id}`" :key="id">
      {{ source.publisher }}, <a :href="source.url" rel="noopener">{{ source.title }}</a>, read {{ READ_ON }}.
    </li>
  </ol>
</template>

<style scoped>
.tc-sources { font-size: 0.9rem; }
.tc-sources li:target { background: var(--vp-c-brand-soft); border-radius: 4px; }

@media print {
  /* A printed sheet keeps the addresses the links held. */
  .tc-sources a::after { content: ' (' attr(href) ')'; word-break: break-all; }
}
</style>
