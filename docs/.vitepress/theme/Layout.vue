<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import HomeHero from '../components/HomeHero.vue'
import HomeToolGrid from '../components/HomeToolGrid.vue'
import HomeComputerCard from '../components/HomeComputerCard.vue'
import { STORE_URL } from '../tools/extension-live'

const { Layout } = DefaultTheme
// `ext-home` styles nothing now: scripts/extension-switch.ts reads it as the marker that the built
// home has the extension's layout.
</script>

<template>
  <Layout :class="{ 'ext-home': STORE_URL }">
    <!-- The home's hero is ours, not VitePress's (see HomeHero.vue). These slots render on
         the home layout only. -->
    <template #home-hero-before>
      <HomeHero />
    </template>
    <template #home-features-before>
      <HomeToolGrid />
      <HomeComputerCard v-if="STORE_URL" />
    </template>
  </Layout>
</template>
