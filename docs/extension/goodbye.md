---
title: Sorry to see you go
description: Tell us in one click why you removed the Realtime BPM Analyzer browser extension.
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
import { EXTENSION_STORE_URL } from '../.vitepress/tools/extension-config'
</script>

# Sorry to see you go

The extension is removed. If you have a second, tell us why: it is anonymous,
just the reason you pick.

<ExtensionGoodbye />

## Changed your mind?

<p v-if="EXTENSION_STORE_URL"><a :href="EXTENSION_STORE_URL">Reinstall the extension</a> any time; it takes one click.</p>

If something broke, [report it on GitHub](https://github.com/dlepaux/realtime-bpm-analyzer/issues/new)
with the site and what you expected. Bugs reported there get fixed.

The [free BPM tools](/) on this site still work in any browser, no install needed.
