<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RotateCcw, Timer, AudioLines } from 'lucide-vue-next'
import { useAnalytics } from '../composables/useAnalytics'
import { estimateTapTempo, pushTap, tapIntervals, tempoMarking } from '../tools/tempo'

const { track } = useAnalytics()

const taps = ref<number[]>([])
// Monotonic, so each tap re-keys the ripple and the pulse: re-mounting the
// element restarts its CSS animation in phase with the tap that caused it.
const tapCount = ref(0)
const pad = ref<HTMLButtonElement | null>(null)

const estimate = computed(() => estimateTapTempo(taps.value))
const bpm = computed(() => (estimate.value ? Math.round(estimate.value.bpm) : null))
const preciseBpm = computed(() => (estimate.value ? estimate.value.bpm.toFixed(1) : null))
const msPerBeat = computed(() => (estimate.value ? 60_000 / estimate.value.bpm : null))
const recentIntervals = computed(() => tapIntervals(taps.value).slice(-15))

const caption = computed(() => {
  const n = taps.value.length
  if (n === 0) return 'Tap along to the beat'
  if (n === 1) return 'Keep going…'
  const jitter = estimate.value?.jitter ?? 1
  const steadiness = n < 4 ? 'Warming up' : jitter < 0.02 ? 'Rock steady' : jitter < 0.05 ? 'Steady' : 'Keep tapping to settle it'
  return `${tempoMarking(estimate.value?.bpm ?? 0)} · ${steadiness}`
})

const bars = computed(() => {
  const intervals = recentIntervals.value
  const longest = Math.max(...intervals, 1)
  const mean = intervals.reduce((sum, v) => sum + v, 0) / (intervals.length || 1)
  return intervals.map((v) => ({
    height: `${Math.max(12, (v / longest) * 100)}%`,
    off: Math.abs(v - mean) / mean > 0.05,
  }))
})

// One event per finished sequence, so GA4 counts sessions of tapping, not taps.
let reportedSequenceStart: number | null = null
function report(sequence: readonly number[]) {
  const first = sequence[0]
  const result = estimateTapTempo(sequence)
  if (sequence.length < 4 || !result || first === reportedSequenceStart) return
  reportedSequenceStart = first ?? null
  track('bpm_tap_measured', { bpm: Math.round(result.bpm), mode: `${sequence.length} taps` })
}

function tap(at: number) {
  const next = pushTap(taps.value, at)
  if (next.length === 1) report(taps.value)
  taps.value = next
  tapCount.value++
}

function reset() {
  report(taps.value)
  taps.value = []
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  tap(event.timeStamp)
}

// Space, Enter or T taps from anywhere on the page, unless another control
// has focus and owns the key. Escape starts over.
function onKeyDown(event: KeyboardEvent) {
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
  const key = event.key.toLowerCase()
  if (![' ', 'enter', 't', 'escape'].includes(key)) return
  const target = event.target instanceof HTMLElement ? event.target : null
  if (target && target !== pad.value && target.closest('a, button, input, select, textarea, [contenteditable="true"]')) return
  event.preventDefault()
  if (key === 'escape') reset()
  else tap(event.timeStamp)
}

const onPageHide = () => report(taps.value)

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('pagehide', onPageHide)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('pagehide', onPageHide)
  report(taps.value)
})
</script>

<template>
  <section
    class="tt-card tap-tempo"
    aria-label="Tap tempo"
  >
    <div
      class="tt-readout"
      aria-live="polite"
    >
      <span
        class="tt-number"
        :class="{ 'is-empty': bpm === null }"
        :aria-hidden="bpm === null"
      >{{ bpm ?? '000' }}</span>
      <span class="tt-unit">BPM</span>
    </div>
    <p class="tt-caption">
      {{ caption }}
    </p>

    <div class="pad-stage">
      <span
        v-if="msPerBeat"
        :key="`pulse-${tapCount}`"
        class="pad-pulse"
        :style="{ animationDuration: `${msPerBeat}ms` }"
        aria-hidden="true"
      ></span>
      <span
        v-if="tapCount > 0"
        :key="`ripple-${tapCount}`"
        class="pad-ripple"
        aria-hidden="true"
      ></span>
      <button
        ref="pad"
        type="button"
        class="pad"
        aria-label="Tap to the beat"
        @pointerdown="onPointerDown"
      >
        <span class="pad-word">TAP</span>
        <span class="pad-count">{{ taps.length ? `${taps.length} ${taps.length === 1 ? 'tap' : 'taps'}` : 'or press space' }}</span>
      </button>
    </div>

    <div
      class="bars"
      aria-hidden="true"
    >
      <span
        v-for="(bar, i) in bars"
        :key="i"
        class="bar"
        :class="{ 'is-off': bar.off }"
        :style="{ height: bar.height }"
      ></span>
    </div>

    <div class="tt-stats">
      <div class="tt-stat">
        <div class="tt-stat-label">
          Precise
        </div>
        <div class="tt-stat-value">
          {{ preciseBpm ?? '—' }}
        </div>
      </div>
      <div class="tt-stat">
        <div class="tt-stat-label">
          ms / beat
        </div>
        <div class="tt-stat-value">
          {{ msPerBeat ? msPerBeat.toFixed(0) : '—' }}
        </div>
      </div>
      <div class="tt-stat">
        <div class="tt-stat-label">
          Steadiness
        </div>
        <div class="tt-stat-value">
          {{ estimate && taps.length > 2 ? `±${(estimate.jitter * 100).toFixed(1)}%` : '—' }}
        </div>
      </div>
    </div>

    <div class="tt-row">
      <button
        type="button"
        class="tt-btn"
        :disabled="taps.length === 0"
        @click="reset"
      >
        <RotateCcw :size="15" /> Reset
      </button>
      <a
        v-if="preciseBpm"
        class="tt-chip"
        :href="`/bpm-to-ms?bpm=${preciseBpm}`"
      >
        <Timer :size="15" /> Delay times at {{ bpm }} BPM
      </a>
      <a
        v-if="bpm"
        class="tt-chip"
        :href="`/metronome?bpm=${bpm}`"
      >
        <AudioLines :size="15" /> Metronome at {{ bpm }}
      </a>
    </div>

    <p class="tt-hint">
      <kbd>Space</kbd> or <kbd>T</kbd> to tap · <kbd>Esc</kbd> to reset · pause 3&nbsp;s to start over
    </p>
  </section>
</template>

<style scoped>
.pad-stage {
  position: relative;
  display: grid;
  place-items: center;
  width: min(240px, 70vw);
  aspect-ratio: 1;
  margin: 1.75rem auto 1.25rem;
}

.pad {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background:
    radial-gradient(circle at 32% 26%, color-mix(in srgb, white 28%, transparent), transparent 55%),
    var(--vp-button-brand-bg);
  color: var(--vp-button-brand-text);
  box-shadow:
    0 24px 60px -18px color-mix(in srgb, var(--vp-c-brand-1) 70%, transparent),
    inset 0 -10px 24px color-mix(in srgb, black 18%, transparent);
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  transition: transform 0.08s ease, box-shadow 0.2s ease;
}

.pad:active {
  transform: scale(0.95);
  box-shadow:
    0 12px 30px -14px color-mix(in srgb, var(--vp-c-brand-1) 70%, transparent),
    inset 0 -6px 18px color-mix(in srgb, black 22%, transparent);
}

.pad-word {
  font-size: 2.6rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  line-height: 1;
}

.pad-count {
  font-size: 0.8rem;
  font-weight: 500;
  opacity: 0.85;
}

.pad-ripple,
.pad-pulse {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  pointer-events: none;
}

.pad-ripple {
  border: 3px solid var(--vp-c-brand-1);
  animation: ripple 0.6s ease-out forwards;
}

/* Breathes at the measured tempo, re-phased on every tap. */
.pad-pulse {
  background: color-mix(in srgb, var(--vp-c-brand-1) 22%, transparent);
  animation: pulse 500ms ease-out infinite;
}

@keyframes ripple {
  from { transform: scale(1); opacity: 0.9; }
  to { transform: scale(1.35); opacity: 0; }
}

@keyframes pulse {
  0% { transform: scale(1); opacity: 0.8; }
  70%, 100% { transform: scale(1.22); opacity: 0; }
}

.bars {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 4px;
  height: 36px;
}

.bar {
  width: 8px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--vp-c-brand-1) 55%, transparent);
  transition: height 0.2s ease;
}

.bar.is-off { background: var(--vp-c-warning-1); }
</style>
