<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAnalytics } from '../composables/useAnalytics'
import { EDGE_URL, STORE_URL } from '../tools/extension-live'
import { SEND_LINK_MAILTO, installRequirement, installTargets, sharePageLink, type ExtensionPlacement, type StoreId } from '../tools/extension-promo'
import { TOUCH_QUERY, detectBrowser, installOffer, readSignals, type VisitorBrowser } from '../tools/extension-browser'

// The install action. It renders from the store listings, so it can't show a button without a
// listing behind it. A phone can't install it, so on a touch device CSS swaps in a way to send the
// page to a computer, with the store links kept for touchscreen laptops.
//
// The server knows no browser, so it renders the neutral offer, Chrome then Edge, which crawlers
// and visitors without JavaScript keep. Once mounted, the visitor's browser picks which store
// leads and the words. Each button keeps its box (fixed width, two lines), so that swap moves
// nothing on the page.
const props = withDefaults(defineProps<{
  placement: 'extension_hero' | 'extension_closing'
  promptLink?: boolean
}>(), { promptLink: false })

const targets = installTargets(STORE_URL, EDGE_URL, props.placement)
const touchTargets = installTargets(STORE_URL, EDGE_URL, 'extension_touch')
const browser = ref<VisitorBrowser>('unknown')
const offer = computed(() => installOffer(targets, browser.value))

onMounted(() => {
  browser.value = detectBrowser(readSignals(navigator, window.matchMedia(TOUCH_QUERY).matches))
})

const { track } = useAnalytics()
const trackStore = (placement: ExtensionPlacement, store: StoreId) =>
  track('extension_link_clicked', { placement, target: 'store', store })

function sendLink(event: MouseEvent) {
  // The phone's way to the extension, counted like the home page's (RBA-154).
  track('extension_link_clicked', { placement: props.placement, target: 'share' })
  const share = typeof navigator.share === 'function' ? navigator.share.bind(navigator) : undefined
  if (sharePageLink(share, () => { window.location.href = SEND_LINK_MAILTO })) event.preventDefault()
}
</script>

<template>
  <div
    v-if="targets.length"
    class="ext-install"
  >
    <div class="ext-install-pointer">
      <div class="ext-install-actions">
        <!-- Keyed by slot, not by store, so a swap rewrites the two boxes in place. -->
        <a
          v-for="(button, slot) in offer.buttons"
          :key="slot"
          class="ext-install-btn"
          :class="{ 'is-primary': button.primary }"
          :href="button.href"
          @click="trackStore(placement, button.id)"
        >
          <span class="ext-install-title">{{ button.title }}</span>
          <span class="ext-install-sub">{{ button.subtitle }}</span>
        </a>
      </div>
      <p class="ext-install-note">
        {{ installRequirement(targets) }}
      </p>
      <p class="ext-install-context">
        {{ offer.context }}
      </p>
      <p
        v-if="promptLink"
        class="ext-install-note"
      >
        <a href="#chrome-prompt">What does the install prompt mean?</a>
      </p>
    </div>
    <div class="ext-install-touch">
      <p class="ext-install-note">
        It installs on a computer, not a phone.
      </p>
      <a
        class="ext-cta"
        :href="SEND_LINK_MAILTO"
        @click="sendLink"
      >Send the link to yourself</a>
      <ul class="ext-install-links">
        <li><a href="/">Find a tempo on this phone</a></li>
        <li
          v-for="target in touchTargets"
          :key="target.id"
        >
          <a
            :href="target.href"
            @click="trackStore('extension_touch', target.id)"
          >See it on {{ target.storeInText }}</a>
        </li>
      </ul>
    </div>
  </div>
</template>
