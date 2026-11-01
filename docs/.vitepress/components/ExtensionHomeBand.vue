<script setup lang="ts">
import ExtensionDemo from './ExtensionDemo.vue'
import { EXTENSION_PAGE } from '../tools/extension-promo'

// The home page's section for the extension, under the hero. Still rather than animated,
// so nothing moves beside the analyzer. It tells a visitor which tool to use by where
// their music is, a thing they already know. Its button goes to the page, which explains
// Chrome's install prompt before anyone meets it.
</script>

<template>
  <section class="ext-band">
    <div class="ext-band-inner">
      <div class="ext-band-copy">
        <p class="ext-band-name">
          <img
            src="/logo.svg"
            alt=""
            width="24"
            height="24"
          >
          Live BPM Detector
        </p>
        <h2>See the tempo of what's playing in a tab</h2>
        <p>
          A free Chrome extension for what's already playing on YouTube, SoundCloud and more.
          Click its button and the live BPM appears on the page. Your audio never leaves your device.
        </p>
        <p class="ext-band-which">
          Have a file, a stream link or music in the room? The analyzer above is the one you want.
          Music in a Chrome tab on your computer? That's the extension.
        </p>
        <a
          class="ext-cta"
          :href="EXTENSION_PAGE"
        >See Live BPM Detector</a>
      </div>
      <ExtensionDemo />
    </div>
  </section>
</template>
