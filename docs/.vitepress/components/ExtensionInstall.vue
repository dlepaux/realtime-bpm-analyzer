<script setup lang="ts">
import { INSTALL_TARGETS } from '../tools/extension-live'

// The install action. Renders from the list of available stores, so it can't show a
// button without a listing behind it. The first browser is the primary action; any
// later one joins beside it as a secondary button, with no redesign.
</script>

<template>
  <div
    v-if="INSTALL_TARGETS.length"
    class="ext-install"
  >
    <div class="ext-install-actions">
      <a
        v-for="(target, index) in INSTALL_TARGETS"
        :key="target.browser"
        class="tt-btn ext-install-btn"
        :class="{ 'tt-btn-primary': index === 0 }"
        :href="target.href"
      >{{ target.label }}</a>
    </div>
    <p
      v-for="target in INSTALL_TARGETS"
      :key="target.browser"
      class="ext-install-note"
    >
      {{ target.requirement }}
    </p>
  </div>
</template>
