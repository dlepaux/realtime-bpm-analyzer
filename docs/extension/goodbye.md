---
title: Sorry to see you go
description: Tell us in one click why you removed the Live BPM Detector browser extension.
aside: false
outline: false
sidebar: false
editLink: false
lastUpdated: false
prev: false
next: false
search: false
head:
  - - meta
    - name: robots
      content: noindex
---

<script setup>
import ExtensionGoodbye from '../.vitepress/components/ExtensionGoodbye.vue'
import { EDGE_URL, STORE_URL } from '../.vitepress/tools/extension-live'
import { installTargets } from '../.vitepress/tools/extension-promo'
import { useAnalytics } from '../.vitepress/composables/useAnalytics'

// One reinstall link per store, so someone who left Edge is not sent to Chrome's.
const reinstallTargets = installTargets(STORE_URL, EDGE_URL, 'goodbye')
const { track } = useAnalytics()
</script>

# Sorry to see you go

Live BPM Detector is removed. If you have a second, tell us why. Picking a reason
sends it to Google Analytics along with the extension's version number, as part
of your visit to this site. [Extension privacy](/extension/privacy) has the details.

<ExtensionGoodbye />

## Changed your mind?

<p v-if="reinstallTargets.length">Reinstall the extension any time from
<template v-for="(target, index) in reinstallTargets" :key="target.id"><template v-if="index > 0"> or </template><a
  :href="target.href"
  @click="track('extension_link_clicked', { placement: 'goodbye', target: 'store', store: target.id })"
>{{ target.storeInText }}</a></template>.</p>

If something broke, [report it on GitHub](https://github.com/dlepaux/realtime-bpm-analyzer/issues/new)
with the site and what you expected. Bugs reported there get fixed.

The [free BPM tools](/) on this site still work in any browser, no install needed.
