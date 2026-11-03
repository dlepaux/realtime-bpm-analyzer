<script setup lang="ts">
import { MousePointerClick, Pin, Play, Puzzle } from 'lucide-vue-next'
import ExtensionPill from './ExtensionPill.vue'
</script>

<template>
  <ol class="ext-steps">
    <li class="ext-step">
      <div
        class="ext-step-visual"
        aria-hidden="true"
      >
        <div class="ext-toolbar">
          <span class="ext-toolbar-address"></span>
          <span class="ext-toolbar-icon"><Puzzle :size="16" /></span>
          <span class="ext-toolbar-icon is-ours"><img
            src="/logo.svg"
            alt=""
            width="16"
            height="16"
          /></span>
          <span class="ext-toolbar-pin"><Pin :size="14" /></span>
        </div>
      </div>
      <h3>Pin the button</h3>
      <p>
        Open the puzzle-piece menu in the toolbar and pin <strong>Live BPM Detector</strong>,
        so its button stays one click away.
      </p>
    </li>
    <li class="ext-step">
      <div
        class="ext-step-visual"
        aria-hidden="true"
      >
        <div class="ext-player">
          <span class="ext-player-play"><Play :size="16" /></span>
          <span class="ext-player-wave">
            <span
              v-for="(h, i) in [40, 70, 55, 90, 60, 80, 45, 75, 50, 65, 85, 40]"
              :key="i"
              :style="{ height: `${h}%` }"
            ></span>
          </span>
        </div>
      </div>
      <h3>Play some music</h3>
      <p>
        Open YouTube, SoundCloud or any other tab that plays music, and press play.
      </p>
    </li>
    <li class="ext-step">
      <div
        class="ext-step-visual"
        aria-hidden="true"
      >
        <div class="ext-click">
          <span class="ext-toolbar-icon is-ours"><img
            src="/logo.svg"
            alt=""
            width="16"
            height="16"
          /><MousePointerClick
            class="ext-click-cursor"
            :size="18"
          /></span>
          <ExtensionPill />
        </div>
      </div>
      <h3>Click it</h3>
      <p>
        Click the button. On a Mac, <kbd>Option</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd> does the
        same. The tempo appears on the player within seconds. Click again to stop.
      </p>
    </li>
  </ol>
</template>
