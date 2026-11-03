<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { useAnalytics } from '../composables/useAnalytics'
import { UNINSTALL_REASONS, readExtensionQuery, type UninstallReason } from '../tools/extension-pages'

const { track } = useAnalytics()

// One click, one event: the enum value and the extension version. It goes through the site's analytics
// wrapper like every other event, so the same GTM tags apply. The site has no consent step today (RBA-84).
const chosen = ref<UninstallReason | null>(null)
const thanks = ref<HTMLElement | null>(null)

// The reasons only work with JavaScript (there is no backend to post to), so they
// appear once mounted instead of sitting inert in the server render.
const ready = ref(false)
onMounted(() => {
  ready.value = true
})

async function choose(reason: UninstallReason) {
  if (chosen.value !== null) return
  chosen.value = reason
  const { version } = readExtensionQuery(window.location.search)
  track('extension_uninstall_reason', version ? { reason, extension_version: version } : { reason })
  // The focused button is gone: hand focus to the thanks so keyboard users stay in place.
  await nextTick()
  thanks.value?.focus()
}
</script>

<template>
  <div class="ext-goodbye">
    <template v-if="ready && chosen === null">
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
      ref="thanks"
      role="status"
      tabindex="-1"
      :class="{ 'ext-goodbye-thanks': chosen !== null }"
    >
      {{ chosen === null ? '' : 'Thank you. That goes straight into what gets fixed next.' }}
    </p>
  </div>
</template>
