<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import { useData } from 'vitepress'
import BpmHeroTool from '../components/BpmHeroTool.vue'

const { Layout } = DefaultTheme
const { frontmatter } = useData()
</script>

<template>
  <Layout>
    <template #home-hero-image>
      <!-- Mobile-only headline block (name + text): appears above the tool so the
           identity + value prop reads as one unit, then the tool follows as demo.
           On desktop this block is `display: none` (see custom.css) and the
           VitePress-rendered `.VPHero .main .name` + `.text` take over.
           On mobile the VitePress originals are `display: none` — which removes
           them from the a11y tree — so screen readers see this block as the
           page's primary heading. No `aria-hidden` here. -->
      <div class="bpm-mobile-hero-head">
        <div
          v-if="frontmatter.hero?.name"
          class="bpm-mobile-hero-name"
        >
          {{ frontmatter.hero.name }}
        </div>
        <div
          v-if="frontmatter.hero?.text"
          class="bpm-mobile-hero-text"
        >
          {{ frontmatter.hero.text }}
        </div>
      </div>
      <BpmHeroTool />
    </template>
  </Layout>
</template>
