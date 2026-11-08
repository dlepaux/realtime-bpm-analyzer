<script setup lang="ts">
// A phone's door to the extension (RBA-66): it can't install there, so instead of a pitch the
// card offers to send the page to a computer, as /extension/ does. Rendered for everyone and shown
// only on touch screens by CSS, so the server's HTML and the hydrated page agree.
import { useAnalytics } from '../composables/useAnalytics'
import { EXTENSION_PAGE, SEND_LINK_MAILTO, sharePageLink } from '../tools/extension-promo'

const { track } = useAnalytics()

function sendLink(event: MouseEvent) {
  track('extension_link_clicked', { placement: 'home_touch', target: 'share' })
  const share = typeof navigator.share === 'function' ? navigator.share.bind(navigator) : undefined
  if (sharePageLink(share, () => { window.location.href = SEND_LINK_MAILTO })) event.preventDefault()
}
</script>

<template>
  <aside class="home-wrap home-computer">
    <div class="home-computer-card">
      <h2>On a computer?</h2>
      <p>A free extension for Chrome and Edge shows the live BPM right on the page you are playing.</p>
      <a
        class="home-computer-send"
        :href="SEND_LINK_MAILTO"
        @click="sendLink"
      >Send the link to yourself</a>
      <a
        class="home-computer-more"
        :href="EXTENSION_PAGE"
        @click="track('extension_link_clicked', { placement: 'home_touch', target: 'page' })"
      >About the extension</a>
    </div>
  </aside>
</template>
