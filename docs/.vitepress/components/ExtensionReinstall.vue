<script setup lang="ts">
// The goodbye page's reinstall links, one per store, so someone who left Edge is not sent to
// Chrome's. A component rather than markdown so its click is type-checked like every other (RBA-154).
import { useAnalytics } from '../composables/useAnalytics'
import { EDGE_URL, STORE_URL } from '../tools/extension-live'
import { installTargets } from '../tools/extension-promo'

const targets = installTargets(STORE_URL, EDGE_URL, 'goodbye')
const { track } = useAnalytics()
</script>

<template>
  <p v-if="targets.length">
    Reinstall the extension any time from
    <template
      v-for="(target, index) in targets"
      :key="target.id"
    >
      <template v-if="index > 0">
        or
      </template>
      <a
        :href="target.href"
        @click="track('extension_link_clicked', { placement: 'goodbye', target: 'store', store: target.id })"
      >{{ target.storeInText }}</a>
    </template>.
  </p>
</template>
