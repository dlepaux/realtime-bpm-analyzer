<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, nextTick, type Component } from 'vue'
import { useAnalytics } from '../composables/useAnalytics'
import { ADDRESSES, ICONS, SCENES, TEMPO_RANGE, crowdPath } from '../tools/extension-scenes'
import type { ScenesPlayback } from '../tools/extension-scenes-player'
import ExtensionSceneOverlay from './ExtensionSceneOverlay.vue'

// The demo on the extension's first screens (RBA-58): drawn pages with the overlay on them, no
// footage and no sound. The server sends the first page, reading, so the first paint and anyone
// without motion or JavaScript see the whole message. On a computer the rest loads once the page
// is idle and it plays once, then rests: a loop beside the BPM tool would compete with it for the
// whole visit, while one pass ends and leaves it alone (Flow, Selective Attention).
const LABEL = `Illustration: drawn versions of a video page, a music player and an audio waveform page. The extension's display listens on each, settles, and turns green, showing ${SCENES.map((scene) => scene.bpm).join(', ')} BPM, and ends on a video page at ${SCENES[0].bpm} BPM, stable. Each page moves at the tempo shown.`

// What decides who gets motion. CSS uses the same width for the phone's layout.
const ANIMATE_WHERE = '(min-width: 720px) and (pointer: fine) and (prefers-reduced-motion: no-preference)'

type Status = 'still' | 'playing' | 'paused' | 'ended'

const { track } = useAnalytics()
const status = ref<Status>('still')
const canvas = ref<HTMLElement>()
const rest = shallowRef<Component>()
const crowdBack = crowdPath(7919, 440)
const crowdFront = crowdPath(104729, 300)

// Invented, like everything on these pages. Tab titles double as the tab's own text.
const TAB_TITLES = { video: 'Afterglow Engine', music: 'Orchard at Noon', waveform: 'Saltwater Static' } as const
const SIDEBAR = [
  { title: 'Rooftop session', by: 'Tideworks' },
  { title: 'Late studio loop', by: 'Quiet Bench' },
  { title: 'Sunset drive', by: 'Coastline' },
  { title: 'Warehouse set', by: 'Lowlight Hall' },
  { title: 'Slow morning', by: 'Coastline' },
]

let playback: ScenesPlayback | null = null
let playScenes: typeof import('../tools/extension-scenes-player').playScenes | null = null
let observer: IntersectionObserver | null = null
// On screen at all, which keeps it running, and half on screen, which starts it.
let inView = false
let halfInView = false
let wanted = false
let armed = false
let motion: MediaQueryList | null = null
let idleHandle = 0

// Off screen and in a hidden tab it holds still, and the visitor's own pause outranks both.
function syncRunning() {
  if (!playback) return
  const shouldRun = wanted && inView && !document.hidden
  if (shouldRun && status.value === 'paused') {
    playback.resume()
    status.value = 'playing'
  } else if (!shouldRun && status.value === 'playing') {
    playback.pause()
    status.value = 'paused'
  }
}

async function start() {
  if (!canvas.value || !playScenes || !motion?.matches) return
  playback?.stop()
  canvas.value.classList.add('is-live')
  await nextTick()
  wanted = true
  playback = playScenes(canvas.value, () => {
    playback = null
    wanted = false
    status.value = 'ended'
    canvas.value?.classList.remove('is-live')
  })
  if (!playback) {
    canvas.value.classList.remove('is-live')
    return
  }
  status.value = 'playing'
  syncRunning()
}

async function load() {
  const [player, restModule] = await Promise.all([
    import('../tools/extension-scenes-player'),
    import('./ExtensionScenesRest.vue'),
  ])
  playScenes = player.playScenes
  rest.value = restModule.default
  await nextTick()
  if (halfInView && status.value === 'still') await start()
}

function onControl() {
  if (status.value === 'ended') {
    track('extension_demo_control', { action: 'replay' })
    void start()
  } else if (status.value === 'playing') {
    track('extension_demo_control', { action: 'pause' })
    wanted = false
    syncRunning()
  } else {
    wanted = true
    syncRunning()
  }
}

function stopForLessMotion() {
  playback?.stop()
  playback = null
  wanted = false
  // A demo that already played has said its piece, so it doesn't come back with the setting.
  if (status.value !== 'ended') status.value = 'still'
  canvas.value?.classList.remove('is-live')
}

function arm() {
  if (armed || !canvas.value) return
  armed = true
  document.addEventListener('visibilitychange', syncRunning)
  observer = new IntersectionObserver((entries) => {
    const entry = entries.at(-1)
    inView = entry?.isIntersecting ?? false
    halfInView = inView && (entry?.intersectionRatio ?? 0) >= 0.5
    if (halfInView && playScenes && status.value === 'still') void start()
    else syncRunning()
  }, { threshold: [0, 0.5] })
  observer.observe(canvas.value)
  // After the page has settled, so the demo never delays the tool or the first paint.
  const idle = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 400))
  idleHandle = idle(() => { void load() })
}

function onMotionChange(event: MediaQueryListEvent) {
  if (!event.matches) stopForLessMotion()
  else if (!armed) arm()
  else if (halfInView && status.value === 'still') void start()
}

onMounted(() => {
  motion = window.matchMedia(ANIMATE_WHERE)
  motion.addEventListener('change', onMotionChange)
  if (motion.matches) arm()
})

onBeforeUnmount(() => {
  if (idleHandle && window.cancelIdleCallback) window.cancelIdleCallback(idleHandle)
  observer?.disconnect()
  motion?.removeEventListener('change', onMotionChange)
  document.removeEventListener('visibilitychange', syncRunning)
  playback?.stop()
})
</script>

<template>
  <figure
    class="ext-stage-figure ext-scenes"
    :data-status="status"
  >
    <div class="ext-scenes-box">
      <div
        ref="canvas"
        class="ext-scenes-canvas"
        role="img"
        :aria-label="LABEL"
        data-nosnippet
      >
        <div
          class="ext-browser"
          aria-hidden="true"
        >
          <div class="ext-tabs">
            <i class="ext-tab-active"></i>
            <span
              v-for="scene in SCENES"
              :key="scene.id"
              class="ext-tab"
              :data-scene="scene.id"
            ><i></i><b>{{ TAB_TITLES[scene.id] }}</b></span>
          </div>
          <div class="ext-browser-bar">
            <svg
              class="ext-icon"
              viewBox="0 0 24 24"
            ><path :d="ICONS.back" /></svg>
            <svg
              class="ext-icon"
              viewBox="0 0 24 24"
            ><path :d="ICONS.forward" /></svg>
            <span class="ext-browser-address"><span
              v-for="scene in SCENES"
              :key="scene.id"
              class="ext-url"
              :data-scene="scene.id"
            >{{ ADDRESSES[scene.id] }}</span></span>
            <span class="ext-browser-action"><img
              src="/logo.svg"
              alt=""
              width="16"
              height="16"
            /></span>
          </div>
        </div>
        <div
          class="ext-scene-area"
          aria-hidden="true"
        >
          <section
            class="ext-scene"
            data-scene="video"
          >
            <div class="vid-mast">
              <svg
                class="ext-icon"
                viewBox="0 0 24 24"
              ><path :d="ICONS.menu" /></svg>
              <i class="vid-mark"></i>
              <span class="vid-search">Search<svg
                class="ext-icon"
                viewBox="0 0 24 24"
              ><path :d="ICONS.search" /></svg></span>
              <i class="sk-avatar"></i>
            </div>
            <div class="vid-main">
              <div class="vid-player">
                <i class="vid-sky"></i>
                <div class="vid-fans">
                  <i class="vid-fan vid-fan-l"></i>
                  <i class="vid-fan vid-fan-r"></i>
                </div>
                <i class="vid-haze"></i>
                <i class="vid-halo"></i>
                <i class="vid-ring vid-ring-1"></i>
                <i class="vid-ring vid-ring-2"></i>
                <i class="vid-sun"></i>
                <svg
                  class="vid-crowd vid-crowd-a"
                  viewBox="0 0 440 70"
                ><path :d="crowdBack" /></svg>
                <svg
                  class="vid-crowd vid-crowd-b"
                  viewBox="0 0 300 70"
                ><path :d="crowdFront" /></svg>
                <div class="vid-controls">
                  <i class="vid-scrub"><b></b></i>
                  <span class="vid-buttons">
                    <svg
                      class="ext-icon"
                      viewBox="0 0 24 24"
                    ><path :d="ICONS.pause" /></svg>
                    <svg
                      class="ext-icon"
                      viewBox="0 0 24 24"
                    ><path :d="ICONS.next" /></svg>
                    <svg
                      class="ext-icon"
                      viewBox="0 0 24 24"
                    ><path :d="ICONS.volume" /></svg>
                    <span class="vid-time">22:14 / 58:02</span>
                    <svg
                      class="ext-icon vid-expand"
                      viewBox="0 0 24 24"
                    ><path :d="ICONS.expand" /></svg>
                  </span>
                </div>
              </div>
              <div class="vid-below">
                <span class="vid-title">Afterglow Engine, full live set</span>
                <div class="vid-channel">
                  <i class="sk-face"></i>
                  <span class="vid-channel-name"><b>Tideworks Sessions</b><small>Live sets every Friday</small></span>
                  <span class="ext-chip ext-chip-solid">Follow</span>
                  <span class="ext-chip">Like</span>
                  <span class="ext-chip">Share</span>
                </div>
              </div>
              <div class="vid-side">
                <div
                  v-for="(card, index) in SIDEBAR"
                  :key="card.title"
                  class="vid-card"
                >
                  <i
                    class="vid-thumb"
                    :data-n="index + 1"
                  ></i>
                  <span><b>{{ card.title }}</b><small>{{ card.by }}</small></span>
                </div>
              </div>
            </div>
          </section>
          <component
            :is="rest"
            v-if="rest"
          />
        </div>
        <ExtensionSceneOverlay />
      </div>
    </div>
    <figcaption class="ext-scenes-caption">
      <span>
        <span>Illustration<span class="ext-scenes-sped">, sped up</span>. Sites simplified, not affiliated with any site named here.</span>
        <span>Reads {{ TEMPO_RANGE.min }} to {{ TEMPO_RANGE.max }} BPM, so other tempos show at half or double.</span>
      </span>
      <button
        class="ext-scenes-control"
        type="button"
        @click="onControl"
      >
        {{ status === 'ended' ? 'Replay' : status === 'paused' ? 'Play' : 'Pause' }}
      </button>
    </figcaption>
  </figure>
</template>
