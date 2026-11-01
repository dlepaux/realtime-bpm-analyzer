<script setup lang="ts">
import { useAnalytics } from '../composables/useAnalytics'
import { INSTALL_TARGETS } from '../tools/extension-live'
import { SEND_LINK_MAILTO, sharePageLink } from '../tools/extension-promo'

// The install action. Renders from the list of available stores, so it can't show a
// button without a listing behind it. The first browser is the primary action; any
// later one joins beside it as a secondary button, with no redesign.
//
// A phone can't install it, so on a touch device the filled button sends the page on
// instead. CSS picks between the two, on the pointer rather than the width: a narrow
// desktop window can install, and nothing changes after hydration. The store link stays
// there too, because a touchscreen Chromebook counts as a touch device and can install.
withDefaults(defineProps<{ promptLink?: boolean }>(), { promptLink: false })

const { track } = useAnalytics()
const trackStoreClick = () => track('extension_link_clicked', { placement: 'extension_page', target: 'store' })

function sendLink(event: MouseEvent) {
  const share = typeof navigator.share === 'function' ? navigator.share.bind(navigator) : undefined
  if (sharePageLink(share, () => { window.location.href = SEND_LINK_MAILTO })) event.preventDefault()
}
</script>

<template>
  <div
    v-if="INSTALL_TARGETS.length"
    class="ext-install"
  >
    <div class="ext-install-pointer">
      <div class="ext-install-actions">
        <a
          v-for="(target, index) in INSTALL_TARGETS"
          :key="target.browser"
          class="tt-btn ext-install-btn"
          :class="{ 'tt-btn-primary': index === 0 }"
          :href="target.href"
          @click="trackStoreClick"
        >{{ target.label }}</a>
      </div>
      <p
        v-for="target in INSTALL_TARGETS"
        :key="target.browser"
        class="ext-install-note"
      >
        {{ target.requirement }}
      </p>
      <p
        v-if="promptLink"
        class="ext-install-note"
      >
        <a href="#chrome-prompt">What does Chrome's install prompt mean?</a>
      </p>
    </div>
    <div class="ext-install-touch">
      <p class="ext-install-note ext-install-note-first">
        It installs on a computer, not a phone.
      </p>
      <a
        class="tt-btn tt-btn-primary ext-send-btn"
        :href="SEND_LINK_MAILTO"
        @click="sendLink"
      >Send the link to yourself</a>
      <div class="ext-install-links">
        <a href="/">Find a tempo on this phone with the BPM Analyzer</a>
        <a
          v-for="target in INSTALL_TARGETS"
          :key="target.browser"
          :href="target.href"
          @click="trackStoreClick"
        >See it on the {{ target.browser }} Web Store</a>
      </div>
    </div>
  </div>
</template>
