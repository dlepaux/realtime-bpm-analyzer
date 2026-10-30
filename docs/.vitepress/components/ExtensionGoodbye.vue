<script setup lang="ts">
import { ref } from 'vue'
import { useAnalytics } from '../composables/useAnalytics'
import { UNINSTALL_REASONS, readExtensionQuery, type UninstallReason } from '../tools/extension-pages'

const { track } = useAnalytics()

// One click, one event, the enum value only. It goes through the site's analytics
// wrapper like every other event, so the same GTM tags and consent apply.
const chosen = ref<UninstallReason | null>(null)

function choose(reason: UninstallReason) {
  if (chosen.value !== null) return
  chosen.value = reason
  const { version } = readExtensionQuery(window.location.search)
  track('extension_uninstall_reason', version ? { reason, extension_version: version } : { reason })
}
</script>

<template>
  <div
    class="ext-goodbye"
    aria-live="polite"
  >
    <template v-if="chosen === null">
      <p class="ext-goodbye-ask">
        What made you remove it? One click is enough.
      </p>
      <div class="ext-reasons">
        <button
          v-for="reason in UNINSTALL_REASONS"
          :key="reason.value"
          type="button"
          class="tt-btn ext-reason"
          @click="choose(reason.value)"
        >
          {{ reason.label }}
        </button>
      </div>
    </template>
    <p
      v-else
      class="ext-goodbye-thanks"
    >
      Thank you. That goes straight into what gets fixed next.
    </p>
  </div>
</template>
