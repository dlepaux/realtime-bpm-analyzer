<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import { useData } from 'vitepress'
import BpmHeroTool from '../components/BpmHeroTool.vue'
import ExtensionHomeBand from '../components/ExtensionHomeBand.vue'
import { STORE_URL } from '../tools/extension-live'

const { Layout } = DefaultTheme
const { site } = useData()
</script>

<template>
  <Layout :class="{ 'ext-home': STORE_URL }">
    <!-- The brand sits above the page's only h1, not inside it: the h1 holds the hero's
         `text` alone, at every width (RBA-129). Below 960px custom.css reorders the
         hero so the brand and the h1 come before the tool, as one headline. -->
    <template #home-hero-info-before>
      <p class="bpm-hero-brand">
        {{ site.title }}
      </p>
    </template>
    <template #home-hero-image>
      <div
        v-if="STORE_URL"
        class="ext-doors"
      >
        <section class="ext-door">
          <h2>Got a file, a mic or a stream link?</h2>
          <BpmHeroTool />
          <p class="ext-door-tools">
            Also free: <a href="/tap-tempo">Tap Tempo</a>, <a href="/bpm-to-ms">BPM to ms</a> and <a href="/metronome">Metronome</a>.
          </p>
        </section>
        <ExtensionHomeBand />
      </div>
      <BpmHeroTool v-else />
    </template>
  </Layout>
</template>
