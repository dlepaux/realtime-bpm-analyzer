<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import { useData } from 'vitepress'
import BpmHeroTool from '../components/BpmHeroTool.vue'

const { Layout } = DefaultTheme
const { site } = useData()
</script>

<template>
  <Layout>
    <!-- The brand sits above the page's only h1, not inside it: the h1 holds the hero's
         `text` alone, at every width (RBA-129). Below 960px custom.css reorders the
         hero so the brand and the h1 come before the tool, as one headline. -->
    <template #home-hero-info-before>
      <p class="bpm-hero-brand">
        {{ site.title }}
      </p>
    </template>
    <template #home-hero-image>
      <BpmHeroTool />
    </template>
  </Layout>
</template>
