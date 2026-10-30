<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { extensionReleases } from '../data/extension-releases'
import { readExtensionQuery, splitReleases, type ExtensionQuery } from '../tools/extension-pages'

// The server render knows no query, so it lists every release: that is the page
// without JavaScript. Once mounted, the versions in the URL narrow it to what is new.
const query = ref<ExtensionQuery>({ version: null, from: null })
onMounted(() => {
  query.value = readExtensionQuery(window.location.search)
})

const split = computed(() => splitReleases(extensionReleases, query.value))
const intro = computed(() => {
  const { version, from } = query.value
  if (version && from) return `You went from version ${from} to ${version}.`
  if (version) return `You're on version ${version}.`
  return null
})
</script>

<template>
  <div class="ext-whats-new">
    <p
      v-if="intro"
      class="ext-whats-new-intro"
    >
      {{ intro }}
    </p>
    <p
      v-if="split.fresh.length === 0"
      class="ext-whats-new-empty"
    >
      {{ split.earlier.length > 0
        ? 'Nothing new since your last version. The notes below are what you already have.'
        : 'The notes for this version are not up yet. Check back soon.' }}
    </p>
    <article
      v-for="release in split.fresh"
      :key="release.version"
      class="ext-release"
    >
      <h2 :id="`v${release.version}`">
        {{ release.title }}
        <span class="ext-release-version">{{ release.version }}</span>
      </h2>
      <ul>
        <li
          v-for="note in release.notes"
          :key="note"
        >
          {{ note }}
        </li>
      </ul>
    </article>
    <details
      v-if="split.earlier.length > 0"
      class="ext-earlier"
      :open="split.fresh.length === 0"
    >
      <summary>Earlier releases</summary>
      <article
        v-for="release in split.earlier"
        :key="release.version"
        class="ext-release"
      >
        <h3>
          {{ release.title }}
          <span class="ext-release-version">{{ release.version }}</span>
        </h3>
        <ul>
          <li
            v-for="note in release.notes"
            :key="note"
          >
            {{ note }}
          </li>
        </ul>
      </article>
    </details>
  </div>
</template>
