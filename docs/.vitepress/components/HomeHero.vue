<script setup lang="ts">
// The home's first screen (RBA-66): the brand as a small line, the page's only h1, then the
// analyzer, which leads. VitePress's own hero is not used: it puts the brand in the h1 and centres
// on phones, and bending it took a page of overrides. The h1 and tagline still come from the
// page's frontmatter (`homeHero`), so the words stay in index.md, where the frozen-text test reads them.
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'
import BpmHeroTool from './BpmHeroTool.vue'
import ExtensionHomeBand from './ExtensionHomeBand.vue'
import { STORE_URL } from '../tools/extension-live'

const { frontmatter, site } = useData()
const hero = computed(() => frontmatter.value.homeHero as { text: string; tagline: string })
</script>

<template>
  <section class="home-hero">
    <div class="home-wrap">
      <p class="home-eyebrow">
        <img
          :src="withBase('/logo.svg')"
          alt=""
          width="20"
          height="20"
        >
        {{ site.title }}
      </p>
      <h1 class="home-title">
        {{ hero.text }}
      </h1>
      <p class="home-tagline">
        {{ hero.tagline }}
      </p>
      <div
        class="home-doors"
        :class="{ 'has-extension': STORE_URL }"
      >
        <BpmHeroTool class="home-tool">
          <template #heading>
            <h2 class="home-tool-heading">
              Got a file, a mic or a stream link?
            </h2>
          </template>
        </BpmHeroTool>
        <ExtensionHomeBand v-if="STORE_URL" />
      </div>
    </div>
  </section>
</template>
