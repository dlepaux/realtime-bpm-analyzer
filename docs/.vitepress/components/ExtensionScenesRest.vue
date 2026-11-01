<script setup lang="ts">
import { ICONS, waveformPath } from '../tools/extension-scenes'
import { adoptSceneStyles } from '../tools/extension-scenes-styles'

// The demo's second and third pages. Loaded with the player, styles included, so a phone that
// only ever shows the first page's still downloads neither. Everything named on them is invented.
adoptSceneStyles()

const QUEUE = [
  { title: 'Orchard at Noon', by: 'Cobalt Loom', time: '3:42' },
  { title: 'Marble Hours', by: 'Cobalt Loom', time: '4:05' },
  { title: 'Vesper Thread', by: 'Anna Quillfeather', time: '2:58' },
  { title: 'Tin Kite', by: 'The Slow Meridians', time: '3:31' },
  { title: 'Glass Allotment', by: 'Anna Quillfeather', time: '5:12' },
  { title: 'Paraffin Summer', by: 'Oda Brightwater', time: '3:19' },
]
const WAVE = waveformPath(124, 48271)
const SEA = ['a', 'b', 'c'] as const
</script>

<template>
  <section
    class="ext-scene ext-scene-later"
    data-scene="music"
  >
    <i class="mus-wash mus-wash-a"></i>
    <i class="mus-wash mus-wash-b"></i>
    <div class="mus-top">
      <svg
        class="ext-icon"
        viewBox="0 0 24 24"
      ><path :d="ICONS.menu" /></svg>
      <span class="mus-chips"><b>Home</b><span>Explore</span><span>Library</span></span>
      <i class="sk-avatar"></i>
    </div>
    <div class="mus-body">
      <div class="mus-stage">
        <i class="mus-glow"></i>
        <div class="mus-art">
          <svg
            class="mus-arcs mus-arcs-a"
            viewBox="0 0 200 200"
          >
            <path
              d="M12 100a88 88 0 0 1 176 0"
              fill="none"
              stroke="#ffb45e"
              stroke-width="17"
              stroke-linecap="round"
            />
            <path
              d="M152 100a52 52 0 0 1-104 0"
              fill="none"
              stroke="#ff5d8f"
              stroke-width="17"
              stroke-linecap="round"
            />
          </svg>
          <svg
            class="mus-arcs mus-arcs-b"
            viewBox="0 0 200 200"
          >
            <path
              d="M170 100a70 70 0 0 1-140 0"
              fill="none"
              stroke="#fff3d6"
              stroke-width="9"
              stroke-linecap="round"
            />
          </svg>
          <i class="mus-sun"></i>
        </div>
      </div>
      <div class="mus-queue">
        <span class="mus-tabs"><b>Up next</b><span>Lyrics</span><span>Related</span></span>
        <div
          v-for="(row, index) in QUEUE"
          :key="row.title"
          class="mus-row"
          :data-current="index === 0"
        >
          <i
            class="mus-thumb"
            :data-n="index + 1"
          ></i>
          <span class="mus-row-text"><b>{{ row.title }}</b><small>{{ row.by }}</small></span>
          <span
            v-if="index === 0"
            class="mus-eq"
          ><i></i><i></i><i></i></span>
          <small
            v-else
            class="mus-time"
          >{{ row.time }}</small>
        </div>
      </div>
    </div>
    <div class="ext-bar mus-bar">
      <span class="ext-bar-buttons">
        <svg
          class="ext-icon"
          viewBox="0 0 24 24"
        ><path :d="ICONS.previous" /></svg>
        <svg
          class="ext-icon ext-icon-big"
          viewBox="0 0 24 24"
        ><path :d="ICONS.pause" /></svg>
        <svg
          class="ext-icon"
          viewBox="0 0 24 24"
        ><path :d="ICONS.next" /></svg>
      </span>
      <i class="mus-thumb"></i>
      <span class="mus-row-text mus-bar-text"><b>Orchard at Noon</b><small>Cobalt Loom</small></span>
    </div>
  </section>

  <section
    class="ext-scene ext-scene-later"
    data-scene="waveform"
  >
    <div class="wav-banner">
      <i class="wav-ribbon wav-ribbon-a"></i>
      <i class="wav-ribbon wav-ribbon-b"></i>
      <i class="wav-flare"></i>
      <div class="wav-head">
        <u class="wav-play"></u>
        <span class="wav-labels"><b>Saltwater Static</b><b class="wav-artist">Low Harbour</b></span>
        <div class="wav-art">
          <i class="wav-art-moon"></i>
          <svg
            v-for="band in SEA"
            :key="band"
            class="wav-art-sea"
            :class="`wav-art-sea-${band}`"
            viewBox="0 0 120 60"
            preserveAspectRatio="none"
          ><path d="M0 14Q15 2 30 14T60 14T90 14T120 14V60H0Z" /></svg>
        </div>
      </div>
      <div class="wav-wave">
        <div class="wav-bars-beat">
          <svg
            class="wav-bars wav-bars-rest"
            viewBox="0 0 372 60"
            preserveAspectRatio="none"
          ><path :d="WAVE" /></svg>
          <div class="wav-played-clip">
            <div class="wav-played-inner">
              <svg
                class="wav-bars wav-bars-played"
                viewBox="0 0 372 60"
                preserveAspectRatio="none"
              ><path :d="WAVE" /></svg>
            </div>
          </div>
        </div>
        <span class="wav-avatars"><i></i><i></i><i></i></span>
      </div>
    </div>
    <div class="wav-below">
      <i class="sk-face"></i>
      <span class="wav-comment">Write a comment</span>
      <span class="ext-chip">Like</span>
      <span class="ext-chip">Repost</span>
    </div>
    <div class="ext-bar wav-bar">
      <span class="ext-bar-buttons">
        <svg
          class="ext-icon"
          viewBox="0 0 24 24"
        ><path :d="ICONS.previous" /></svg>
        <svg
          class="ext-icon ext-icon-big"
          viewBox="0 0 24 24"
        ><path :d="ICONS.pause" /></svg>
        <svg
          class="ext-icon"
          viewBox="0 0 24 24"
        ><path :d="ICONS.next" /></svg>
      </span>
      <i class="wav-progress"><b></b></i>
      <small class="wav-clock">4:36</small>
      <i class="wav-thumb"></i>
      <span class="mus-row-text wav-bar-text"><b>Saltwater Static</b><small>Low Harbour</small></span>
    </div>
  </section>
</template>
