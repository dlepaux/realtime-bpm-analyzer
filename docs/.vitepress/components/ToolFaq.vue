<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'

// Renders the page's `faq:` frontmatter. config.ts emits the same list as
// FAQPage JSON-LD, and Google requires the marked-up answers to be visible,
// so one source for both keeps them from drifting apart.
const { frontmatter } = useData()
const items = computed(() => (frontmatter.value.faq ?? []) as { q: string; a: string }[])
</script>

<template>
  <div class="tool-faq">
    <template
      v-for="item in items"
      :key="item.q"
    >
      <h3>{{ item.q }}</h3>
      <p>{{ item.a }}</p>
    </template>
  </div>
</template>
