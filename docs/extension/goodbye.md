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
import { STORE_URL } from '../.vitepress/tools/extension-live'
</script>

# Sorry to see you go

Live BPM Detector is removed. If you have a second, tell us why. Picking a reason
sends it to Google Analytics along with the extension's version number, as part
of your visit to this site. [Extension privacy](/extension/privacy) has the details.

<ExtensionGoodbye />

## Changed your mind?

<p v-if="STORE_URL"><a :href="STORE_URL">Reinstall the extension</a> any time.</p>

If something broke, [report it on GitHub](https://github.com/dlepaux/realtime-bpm-analyzer/issues/new)
with the site and what you expected. Bugs reported there get fixed.

The [free BPM tools](/) on this site still work in any browser, no install needed.
