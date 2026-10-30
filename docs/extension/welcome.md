---
title: Welcome to the BPM extension
description: How to see the live BPM of any tab in three steps, and what the extension does with your audio. Nothing leaves your device.
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
import ExtensionPill from '../.vitepress/components/ExtensionPill.vue'
import ExtensionSteps from '../.vitepress/components/ExtensionSteps.vue'
import ExtensionOptIn from '../.vitepress/components/ExtensionOptIn.vue'
</script>

# You're set. Now play some music.

Realtime BPM Analyzer puts the tempo of whatever is playing right on the player,
live, as the track goes.

<div class="ext-stage">
  <div class="ext-stage-wave" aria-hidden="true">
    <span v-for="(h, i) in [30, 55, 42, 80, 64, 92, 50, 70, 38, 86, 60, 74, 44, 96, 58, 68, 36, 82, 52, 90, 46, 72, 62, 40, 84, 56, 66, 34]" :key="i" :style="{ height: h + '%' }"></span>
  </div>
  <div class="ext-stage-bar" aria-hidden="true"></div>
  <ExtensionPill class="ext-stage-pill" intro />
</div>

## Three steps to your first tempo

<ExtensionSteps />

## Your audio stays on your device

<div class="ext-promise">

Your audio never leaves your device.

The extension listens to the tab you choose, only after you click, and works out
the tempo on your computer. It sends nothing anywhere: no analytics, no install
ID, not a single network request. It keeps nothing but the id of the tab it is
listening to, and forgets that when the browser closes.

</div>

This page is part of the website, which counts visits with Google Analytics, like
the rest of realtime-bpm-analyzer.com. The only thing the extension told it is its
version number, in the address. [Website privacy](/website-privacy) has the details.

## Coming in Pro

The live BPM stays free. Pro is for DJs and producers who prepare whole crates:

<dl class="ext-pro">
  <dt>Musical key</dt>
  <dd>The key of the track, next to its tempo.</dd>
  <dt>Harmonic mixing</dt>
  <dd>Which tracks mix cleanly into the one playing, by key and tempo.</dd>
  <dt>Batch tagging</dt>
  <dd>Analyse a folder of tracks and write BPM and key into their tags at once.</dd>
</dl>

<ExtensionOptIn />

Something not working? [Open an issue on GitHub](https://github.com/dlepaux/realtime-bpm-analyzer/issues/new).
In the meantime, the [free BPM tools](/) work in any browser.
