<script setup lang="ts">
// The strobe light (RBA-237). Every safety decision is in tools/strobe.ts, where node --test
// checks it: this component feeds it frame times, taps and the tempo, and draws what it returns.
// start() is called from the Start button's click and nowhere else, and every stop path ends in
// halt(). The library loads with the microphone mode only, never with the page (RBA-123).
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { Hand, Maximize, Minus, Plus, Square, Zap } from 'lucide-vue-next'
import type { BpmAnalyzer } from 'realtime-bpm-analyzer'
import { useAnalytics } from '../composables/useAnalytics'
import { openAnalysis } from '../tools/audio-setup'
import { classifyMicError } from '../tools/mic-error'
import {
  EVERY_OTHER_BEAT_ABOVE_BPM,
  IDLE,
  MIN_GAP_MS,
  STAGE_COLOR,
  alignToTap,
  beatsPerFlash,
  flashAnimation,
  initialStyle,
  isTooSoonAfterStop,
  start as strobeStart,
  step,
  stop as strobeStop,
  type FlashKind,
  type FlashStyle,
  type Strobe,
  type TempoSource,
} from '../tools/strobe'
import { MAX_BPM, MIN_BPM, TAP_TIMEOUT_MS, clampBpm, parseBpmParam, tapToSet } from '../tools/tempo'

const { track } = useAnalytics()

const SOURCES: readonly { id: TempoSource; label: string }[] = [
  { id: 'typed', label: 'Type' },
  { id: 'tapped', label: 'Tap' },
  { id: 'mic', label: 'Microphone' },
]
const STYLES: readonly { id: FlashStyle; label: string }[] = [
  { id: 'flash', label: 'Full flash' },
  { id: 'pulse', label: 'Soft pulse' },
]

const source = ref<TempoSource>('typed')
const bpm = ref(120)
const micBpm = ref<number | null>(null)
const beatsPerBar = ref(4)
const style = ref<FlashStyle>('flash')
const reducedMotion = ref(false)
const running = ref(false)
const micError = ref<string | null>(null)
const tapTimes = ref<number[]>([])
const canFullscreen = ref(false)

const stage = ref<HTMLElement | null>(null)
const light = ref<HTMLElement | null>(null)
const startButton = ref<HTMLButtonElement | null>(null)
const stopButton = ref<HTMLButtonElement | null>(null)

/** The tempo the grid follows now: the microphone's once it has one, else the typed or tapped one. */
const tempo = computed<number | null>(() => (source.value === 'mic' ? micBpm.value : bpm.value))
const halfTime = computed(() => tempo.value !== null && beatsPerFlash(tempo.value) === 2)
const status = computed(() => {
  if (!running.value) return ''
  if (tempo.value === null) return 'Listening for a steady tempo…'
  const every = halfTime.value ? ', flashing every second beat' : ''
  return `${Math.round(tempo.value)} BPM${every}`
})

let strobe: Strobe = IDLE
let frame: number | undefined
let generation = 0
let tapBeat = 0
let stoppedAt: number | null = null
let wakeLock: WakeLockSentinel | null = null
let mic: { stream: MediaStream; context: AudioContext; analyzer: BpmAnalyzer } | null = null

function setBpm(value: number) {
  bpm.value = Math.round(clampBpm(value))
}

// ── Drawing ───────────────────────────────────────────────────────────────────────────────

function onFrame(now: number) {
  const result = step(strobe, { now, bpm: tempo.value, beatsPerBar: beatsPerBar.value })
  strobe = result.state
  if (result.flash && tempo.value !== null) show(result.flash, tempo.value)
  frame = requestAnimationFrame(onFrame)
}

// The Web Animations API runs the flash off the main thread's style work, and cancel() ends it at once.
function show(kind: FlashKind, at: number) {
  const interval = Math.max(MIN_GAP_MS, (60_000 / at) * beatsPerFlash(at))
  const { color, peakOpacity, attackMs, decayMs } = flashAnimation(style.value, kind, interval)
  const keyframes = attackMs === 0
    ? [{ opacity: peakOpacity, backgroundColor: color }, { opacity: peakOpacity, backgroundColor: color, offset: 0.4 }, { opacity: 0, backgroundColor: color }]
    : [{ opacity: 0, backgroundColor: color }, { opacity: peakOpacity, backgroundColor: color, offset: attackMs / (attackMs + decayMs) }, { opacity: 0, backgroundColor: color }]
  light.value?.animate(keyframes, { duration: attackMs + decayMs, easing: attackMs === 0 ? 'linear' : 'ease-in-out' })
}

// ── Start and stop ────────────────────────────────────────────────────────────────────────

/** The only start: the Start button's click, after the warning above it. */
async function startFromClick(event: MouseEvent) {
  if (running.value || isTooSoonAfterStop(stoppedAt, event.timeStamp)) return
  const gen = ++generation
  micError.value = null
  strobe = strobeStart(strobe)
  // Taps just before Start say where the beat is; older ones would skew the new run's downbeat.
  const lastTap = tapTimes.value[tapTimes.value.length - 1]
  if (lastTap !== undefined && event.timeStamp - lastTap < TAP_TIMEOUT_MS && tempo.value !== null) {
    strobe = alignToTap(strobe, lastTap, 60_000 / tempo.value, tapBeat)
  } else tapTimes.value = []
  running.value = true
  track('bpm_strobe_started', { tempo_source: source.value, ...(source.value === 'mic' ? {} : { bpm: bpm.value }) })
  frame = requestAnimationFrame(onFrame)
  await nextTick()
  // The stage is fixed to the window, and preventScroll keeps the page behind it where it was.
  stopButton.value?.focus({ preventScroll: true })
  void keepAwake(gen)
  if (source.value === 'mic') await listen(gen)
}

/** Stops everything the strobe holds. Safe to call at any time and more than once. */
function halt() {
  generation++
  stoppedAt = performance.now()
  strobe = strobeStop(strobe)
  if (frame !== undefined) cancelAnimationFrame(frame)
  frame = undefined
  light.value?.getAnimations().forEach((animation) => animation.cancel())
  running.value = false
  micBpm.value = null
  void wakeLock?.release().catch(() => undefined)
  wakeLock = null
  closeMic()
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
}

// A held Enter repeats onto Start once a stop returns focus there: only a fresh press starts it.
function onStartKey(event: KeyboardEvent) {
  if (event.repeat) event.preventDefault()
}

/** Every stop path: halts, then gives the keyboard back to the Start button. */
async function stopAndRefocus() {
  if (!running.value) return
  halt()
  await nextTick()
  startButton.value?.focus()
}

// Keeps the screen on while it runs; a refusal or a missing API is harmless.
async function keepAwake(gen: number) {
  if (!('wakeLock' in navigator)) return
  try {
    const sentinel = await navigator.wakeLock.request('screen')
    if (gen === generation) wakeLock = sentinel
    else void sentinel.release().catch(() => undefined)
  } catch {
    wakeLock = null
  }
}

function enterFullscreen() {
  void stage.value?.requestFullscreen().catch(() => undefined)
}

// ── Microphone ────────────────────────────────────────────────────────────────────────────

async function listen(gen: number) {
  let stream: MediaStream | null = null
  try {
    // Voice processing off, so music from the room isn't cancelled as echo or flattened.
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false,
    })
    const opened = stream
    if (gen !== generation) return opened.getTracks().forEach((t) => t.stop())
    const { createRealtimeBpmAnalyzer } = await import('realtime-bpm-analyzer')
    if (gen !== generation) return opened.getTracks().forEach((t) => t.stop())
    const [input] = opened.getAudioTracks()
    const { context, analyzer } = await openAnalysis(
      () => new AudioContext(),
      (ctx) => createRealtimeBpmAnalyzer(ctx, input ? { liveInput: input } : {}),
      () => opened.getTracks().forEach((t) => t.stop()),
    )
    stream = null
    if (gen !== generation) return dispose({ stream: opened, context, analyzer })
    mic = { stream: opened, context, analyzer }
    // Not connected to the speakers: the sound is analysed and dropped.
    context.createMediaStreamSource(opened).connect(analyzer.input)
    // Flashes follow a locked tempo only; a lock can move without a statechange, so readings
    // update it. Unlocked or following a new tempo, the last one holds and the grid drifts until
    // the next lock; with no pulse or no input, it goes dark.
    analyzer.on('reading', (reading) => {
      if (analyzer.state.status === 'locked') micBpm.value = reading.bpm
    })
    analyzer.on('statechange', ({ to }) => {
      if (to.status === 'locked') micBpm.value = to.reading.bpm
      if (to.status === 'listening' && (to.reason === 'pulse-lost' || to.reason === 'audio-lost')) micBpm.value = null
      if (to.status === 'stopped' && to.error) void stopWithError(gen, 'The tempo reading stopped. Check your microphone and try again.')
    })
    input?.addEventListener('ended', () => void stopAndRefocus())
  } catch (error) {
    stream?.getTracks().forEach((t) => t.stop())
    if (gen !== generation) return
    const message = classifyMicError(error).error_kind === 'denied'
      ? 'Microphone access denied. Enable it in your browser settings and try again.'
      : 'Couldn’t start the microphone. Check your device and try again.'
    console.error('[StrobeLight] mic setup failed:', error)
    await stopWithError(gen, message)
  }
}

// Shown once the setup panel is back, so the alert is announced and Start describes it.
async function stopWithError(gen: number, message: string) {
  if (gen !== generation) return
  await stopAndRefocus()
  micError.value = message
}

function dispose(held: { stream: MediaStream; context: AudioContext; analyzer: BpmAnalyzer }) {
  try {
    held.analyzer.stop()
    held.analyzer.disconnect()
  } catch (e) {
    console.debug('[StrobeLight] analyzer dispose:', e)
  }
  held.stream.getTracks().forEach((t) => t.stop())
  held.context.close().catch((e) => console.debug('[StrobeLight] context close:', e))
}

function closeMic() {
  if (mic) dispose(mic)
  mic = null
}

// ── Taps ──────────────────────────────────────────────────────────────────────────────────

/**
 * A tap sets the tempo in the Tap mode (from the third tap, as on the metronome) and, while it
 * runs, says where the beat falls: the first tap of a run is the downbeat.
 */
function tap(at: number) {
  const { taps, bpm: tapped } = tapToSet(tapTimes.value, at)
  tapBeat = taps.length === 1 ? 0 : tapBeat + 1
  tapTimes.value = taps
  if (source.value === 'tapped' && tapped !== null) setBpm(tapped)
  if (tempo.value !== null) strobe = alignToTap(strobe, at, 60_000 / tempo.value, tapBeat)
}

function onTapPointer(event: PointerEvent) {
  if (event.button === 0) tap(event.timeStamp)
}

// A keyboard press on the Tap button arrives as a click with no pointer (detail 0).
function onTapClick(event: MouseEvent) {
  if (event.detail === 0) tap(event.timeStamp)
}

// ── Keys and page events ──────────────────────────────────────────────────────────────────

function onKeyDown(event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey || event.altKey) return
  const key = event.key
  if (running.value && (key === 'Escape' || key === ' ')) {
    event.preventDefault()
    void stopAndRefocus()
    return
  }
  const target = event.target instanceof HTMLElement ? event.target : null
  // A text field elsewhere on the page, such as the search, keeps its keys.
  if (target?.closest('input, select, textarea, [contenteditable="true"]')) return
  // While it runs, focus is on Stop or the stage's controls: the keys work from there too.
  if (!running.value && target?.closest('a, button, input, select, textarea, [contenteditable="true"]')) return
  const typed = source.value === 'typed'
  if (key.toLowerCase() === 't' && !event.repeat && (running.value || source.value === 'tapped')) tap(event.timeStamp)
  else if (typed && (key === 'ArrowUp' || key === 'ArrowRight')) setBpm(bpm.value + (event.shiftKey ? 10 : 1))
  else if (typed && (key === 'ArrowDown' || key === 'ArrowLeft')) setBpm(bpm.value - (event.shiftKey ? 10 : 1))
  else return
  event.preventDefault()
}

// While it runs the stage covers the page, so Tab can't reach controls hidden behind the light:
// focus that leaves the stage goes back to Stop.
function onFocusIn(event: FocusEvent) {
  if (running.value && event.target instanceof Node && !stage.value?.contains(event.target)) stopButton.value?.focus({ preventScroll: true })
}

function onVisibility() {
  if (document.visibilityState === 'hidden') void stopAndRefocus()
}

// Esc in full screen goes to the browser, which leaves full screen: that is a stop too.
function onFullscreenChange() {
  if (!document.fullscreenElement && running.value) void stopAndRefocus()
}

onMounted(() => {
  const fromUrl = parseBpmParam(new URLSearchParams(window.location.search).get('bpm'))
  if (fromUrl !== null) setBpm(fromUrl)
  style.value = initialStyle(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  reducedMotion.value = style.value === 'pulse'
  canFullscreen.value = document.fullscreenEnabled === true
  window.addEventListener('keydown', onKeyDown)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', stopAndRefocus)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  document.addEventListener('focusin', onFocusIn)
})

onBeforeUnmount(() => {
  halt()
  window.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('visibilitychange', onVisibility)
  window.removeEventListener('pagehide', stopAndRefocus)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  document.removeEventListener('focusin', onFocusIn)
})
</script>

<template>
  <section
    class="tt-card strobe"
    aria-label="Strobe light"
  >
    <div
      v-show="!running"
      class="strobe-setup"
    >
      <div class="tt-field">
        <span class="tt-label">Tempo from</span>
        <div
          class="tt-segmented"
          role="group"
          aria-label="Tempo source"
        >
          <button
            v-for="option in SOURCES"
            :key="option.id"
            type="button"
            :aria-pressed="source === option.id"
            @click="source = option.id"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div
        v-if="source !== 'mic'"
        class="strobe-tempo"
      >
        <div class="strobe-bpm">
          <button
            v-if="source === 'typed'"
            type="button"
            class="tt-btn tt-btn-round"
            aria-label="Slower"
            @click="setBpm(bpm - 1)"
          >
            <Minus :size="18" />
          </button>
          <div
            class="tt-readout"
            aria-live="polite"
          >
            <span class="tt-number">{{ bpm }}</span>
            <span class="tt-unit">BPM</span>
          </div>
          <button
            v-if="source === 'typed'"
            type="button"
            class="tt-btn tt-btn-round"
            aria-label="Faster"
            @click="setBpm(bpm + 1)"
          >
            <Plus :size="18" />
          </button>
        </div>
        <input
          v-if="source === 'typed'"
          :value="bpm"
          class="tt-range"
          type="range"
          :min="MIN_BPM"
          :max="MAX_BPM"
          step="1"
          aria-label="Tempo in BPM"
          @input="setBpm(Number(($event.target as HTMLInputElement).value))"
        />
        <template v-else>
          <button
            type="button"
            class="tt-btn strobe-tap"
            @pointerdown="onTapPointer"
            @click="onTapClick"
          >
            <Hand :size="18" /> Tap the beat
          </button>
          <p class="tt-caption">
            {{ tapTimes.length >= 3 ? `${tapTimes.length} taps` : 'Tap three times or more, or press T' }}
          </p>
        </template>
      </div>
      <p
        v-else
        class="strobe-note"
      >
        Press Start to listen. The tempo is read in your browser, and your audio stays on your
        device. The flashes begin once a steady tempo is found. Tap along to line them up with the beat.
      </p>

      <div class="strobe-settings">
        <div class="tt-field">
          <span
            id="strobe-bar-label"
            class="tt-label"
          >
            Beats per bar
          </span>
          <div
            class="strobe-stepper"
            role="group"
            aria-labelledby="strobe-bar-label"
          >
            <button
              type="button"
              class="tt-btn tt-btn-round small"
              aria-label="Fewer beats per bar"
              :disabled="beatsPerBar <= 1"
              @click="beatsPerBar--"
            >
              <Minus :size="14" />
            </button>
            <span
              class="strobe-stepper-value"
              aria-live="polite"
            >
              {{ beatsPerBar }}
            </span>
            <button
              type="button"
              class="tt-btn tt-btn-round small"
              aria-label="More beats per bar"
              :disabled="beatsPerBar >= 12"
              @click="beatsPerBar++"
            >
              <Plus :size="14" />
            </button>
          </div>
        </div>
        <div class="tt-field">
          <span class="tt-label">Light</span>
          <div
            class="tt-segmented"
            role="group"
            aria-label="Light style"
          >
            <button
              v-for="option in STYLES"
              :key="option.id"
              type="button"
              :aria-pressed="style === option.id"
              @click="style = option.id"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
      </div>
      <p
        v-if="reducedMotion"
        class="strobe-note"
      >
        Your device asks for reduced motion, so the soft pulse is chosen. Pick Full flash only if you want it.
      </p>

      <div
        id="strobe-warning"
        class="strobe-warning"
      >
        <strong>Photosensitivity warning.</strong> This tool flashes the screen, which can trigger
        seizures in people with photosensitive epilepsy. It flashes at most three times a second, and
        above {{ EVERY_OTHER_BEAT_ABOVE_BPM }} BPM on every second beat. Stop it at any time with Esc, Space, the Stop button or a
        tap on the light.
      </div>
      <p
        v-if="micError"
        id="strobe-error"
        class="strobe-error"
        role="alert"
      >
        {{ micError }}
      </p>
      <div class="tt-row">
        <button
          ref="startButton"
          type="button"
          class="tt-btn tt-btn-primary strobe-start"
          :aria-describedby="micError ? 'strobe-error strobe-warning' : 'strobe-warning'"
          @keydown.enter="onStartKey"
          @click="startFromClick"
        >
          <Zap :size="20" /> Start the strobe
        </button>
      </div>
      <p class="tt-hint">
        <kbd>Esc</kbd> or <kbd>Space</kbd> stop · <kbd>T</kbd> tap · <kbd>↑</kbd><kbd>↓</kbd> tempo when typed
      </p>
    </div>

    <div
      v-show="running"
      ref="stage"
      class="strobe-stage"
      role="dialog"
      aria-modal="true"
      aria-label="Strobe light running"
      @pointerdown.prevent="stopAndRefocus"
    >
      <div
        ref="light"
        class="strobe-light"
        aria-hidden="true"
      ></div>
      <div class="strobe-stage-top">
        <p
          class="strobe-status"
          role="status"
        >
          {{ status }}
        </p>
        <p class="strobe-stage-hint">
          Tap the light, or press Esc or Space, to stop
        </p>
      </div>
      <div
        class="strobe-controls"
        @pointerdown.stop
      >
        <div class="tt-row">
          <button
            ref="stopButton"
            type="button"
            class="tt-btn tt-btn-primary strobe-stop"
            @click="stopAndRefocus"
          >
            <Square :size="20" /> Stop
          </button>
          <button
            type="button"
            class="tt-btn"
            @pointerdown="onTapPointer"
            @click="onTapClick"
          >
            <Hand :size="16" /> {{ source === 'tapped' ? 'Tap the beat' : 'Tap to line up' }}
          </button>
          <button
            v-if="source === 'typed'"
            type="button"
            class="tt-btn tt-btn-round"
            aria-label="Slower"
            @click="setBpm(bpm - 1)"
          >
            <Minus :size="16" />
          </button>
          <button
            v-if="source === 'typed'"
            type="button"
            class="tt-btn tt-btn-round"
            aria-label="Faster"
            @click="setBpm(bpm + 1)"
          >
            <Plus :size="16" />
          </button>
          <button
            v-if="canFullscreen"
            type="button"
            class="tt-btn"
            @click="enterFullscreen"
          >
            <Maximize :size="16" /> Full screen
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.strobe-setup {
  display: grid;
  gap: 1.25rem;
}

.strobe-tempo { text-align: center; }

.strobe-bpm {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(0.75rem, 4vw, 2rem);
}

.strobe-tap {
  min-width: 12rem;
  margin-top: 0.5rem;
  padding: 1rem 1.5rem;
  font-size: 1.05rem;
  touch-action: manipulation;
}

.strobe-settings {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1.25rem 1rem;
}

.strobe-stepper {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
}

.strobe-stepper-value {
  min-width: 2ch;
  font-size: 1.1rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.tt-btn-round.small {
  width: 2rem;
  height: 2rem;
}

.strobe-note,
.strobe-error {
  margin: 0;
  font-size: 0.9rem;
  color: var(--vp-c-text-2);
}

.strobe-error { color: var(--vp-c-danger-1); }

.strobe-warning {
  padding: 1rem 1.1rem;
  border: 1px solid var(--vp-c-warning-1);
  border-radius: 12px;
  background: var(--vp-c-warning-soft);
  font-size: 0.92rem;
  line-height: 1.55;
}

.strobe-start,
.strobe-stop {
  min-width: 12rem;
  padding: 0.85rem 1.75rem;
  font-size: 1.05rem;
  font-weight: 600;
}

/*
 * While it runs, the stage covers the window, above the site's nav: the light is the whole window
 * but the controls strip, and nothing scrolls it away. In the page's flow, focus moving to Stop
 * scrolled most of it off a phone's screen. Full screen, where the browser has it, only grows the
 * window; iPhone Safari has none for a page element and gets the same light. Black between
 * flashes, whatever the theme: tools/strobe.ts picks the flash colours against it.
 */
.strobe-stage {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overscroll-behavior: contain;
  background: v-bind(STAGE_COLOR);
  color: #fff;
  cursor: pointer;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
}

.strobe-light {
  position: absolute;
  inset: 0;
  opacity: 0;
  pointer-events: none;
}

/* Over the light, readable on black and on a flash alike. A tap here is a tap on the light. */
.strobe-stage-top {
  position: relative;
  padding: calc(0.75rem + env(safe-area-inset-top)) 1rem 0;
  text-align: center;
  mix-blend-mode: difference;
  pointer-events: none;
}

.strobe-stage-hint {
  margin: 0.15rem 0 0;
  font-size: 0.85rem;
  color: #c8c8c8;
}

.strobe-status {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: #fff;
}

/* One strip at the bottom, clear of a phone's home indicator. */
.strobe-controls {
  position: relative;
  padding: 0.75rem 0.75rem calc(0.75rem + env(safe-area-inset-bottom));
  background: rgb(0 0 0 / 0.85);
  cursor: default;
}

.strobe-controls .tt-row { margin-top: 0; }

.strobe-controls .tt-btn:not(.strobe-stop) {
  padding: 0.5rem 0.8rem;
  font-size: 0.9rem;
}

/*
 * Stop is as large as Start and grows to 20rem: on a phone that is a row of its own, above the
 * smaller controls; on a wide screen they share one row.
 */
.strobe-controls .strobe-stop {
  flex: 1 1 20rem;
  max-width: 20rem;
}
</style>
