<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Hand, Minus, Pause, Play, Plus, Timer } from 'lucide-vue-next'
import { useAnalytics } from '../composables/useAnalytics'
import {
  MAX_BPM,
  MIN_BPM,
  clampBpm,
  clickKind,
  estimateTapTempo,
  parseBpmParam,
  pushTap,
  tempoMarking,
  type ClickKind,
} from '../tools/tempo'

const { track } = useAnalytics()

const SUBDIVISIONS = [
  { value: 1, label: 'Quarters' },
  { value: 2, label: 'Eighths' },
  { value: 3, label: 'Triplets' },
  { value: 4, label: '16ths' },
] as const
const PITCH: Record<ClickKind, number> = { accent: 1760, beat: 1320, sub: 880 }
const SWING_DEG = 28
// The scheduler wakes every LOOKAHEAD_MS and books every click due within
// SCHEDULE_AHEAD_S on the audio clock, so timer jitter never reaches the sound.
const LOOKAHEAD_MS = 25
const SCHEDULE_AHEAD_S = 0.12

const bpm = ref(120)
const beatsPerBar = ref(4)
const subdivision = ref<number>(1)
const accent = ref(true)
const volume = ref(0.8)
const running = ref(false)
const currentBeat = ref(-1)
const beatFlash = ref(0)
const angle = ref(0)
const tapTimes = ref<number[]>([])

const marking = computed(() => tempoMarking(bpm.value))
// A real metronome's weight slides up the arm to slow it down.
const weightY = computed(() => 34 + ((bpm.value - MIN_BPM) / (MAX_BPM - MIN_BPM)) * 56)

let ctx: AudioContext | null = null
let master: GainNode | null = null
let schedulerTimer: number | undefined
let frame: number | undefined
let wakeLock: WakeLockSentinel | null = null
let reducedMotion = false
let generation = 0

let tick = 0
let nextTickTime = 0
let beatNumber = 0
let lastBeatTime = 0
const queue: { tick: number; time: number }[] = []

function setBpm(value: number) {
  bpm.value = Math.round(clampBpm(value))
}

function playClick(kind: ClickKind, time: number) {
  if (!ctx || !master) return
  const effective = kind === 'accent' && !accent.value ? 'beat' : kind
  const osc = ctx.createOscillator()
  const envelope = ctx.createGain()
  osc.type = 'triangle'
  osc.frequency.value = PITCH[effective]
  const peak = effective === 'sub' ? 0.35 : 1
  envelope.gain.setValueAtTime(0.0001, time)
  envelope.gain.exponentialRampToValueAtTime(peak, time + 0.002)
  envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.05)
  osc.connect(envelope).connect(master)
  osc.start(time)
  osc.stop(time + 0.06)
}

// ponytail: setInterval is throttled in some background tabs (Safari mainly);
// Chrome exempts audible tabs. A Worker-driven timer is the upgrade if users report drift.
function schedule() {
  if (!ctx) return
  while (nextTickTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
    playClick(clickKind(tick, beatsPerBar.value, subdivision.value), nextTickTime)
    queue.push({ tick, time: nextTickTime })
    nextTickTime += 60 / bpm.value / subdivision.value
    tick++
  }
}

// Visuals follow what is audible now, read from the audio clock, never from timers.
function draw() {
  if (!ctx) return
  const now = ctx.currentTime - (ctx.outputLatency || 0)
  while (queue.length && (queue[0] as { time: number }).time <= now) {
    const played = queue.shift() as { tick: number; time: number }
    if (played.tick % subdivision.value !== 0) continue
    currentBeat.value = Math.floor(played.tick / subdivision.value) % beatsPerBar.value
    beatFlash.value++
    beatNumber++
    lastBeatTime = played.time
  }
  if (!reducedMotion && beatNumber > 0) {
    const progress = Math.min(1, (now - lastBeatTime) / (60 / bpm.value))
    // Each beat lands at an end of the swing, alternating sides.
    angle.value = SWING_DEG * Math.cos(Math.PI * (beatNumber - 1 + progress))
  }
  frame = requestAnimationFrame(draw)
}

async function start() {
  // Claimed before the await; the generation check below drops a start that
  // was stopped (or superseded) while the context was resuming.
  running.value = true
  const gen = ++generation
  ctx ??= new AudioContext()
  if (!master) {
    master = ctx.createGain()
    master.connect(ctx.destination)
  }
  master.gain.value = volume.value
  await ctx.resume()
  if (gen !== generation) return

  tick = 0
  beatNumber = 0
  queue.length = 0
  nextTickTime = ctx.currentTime + 0.06
  schedule()
  schedulerTimer = window.setInterval(schedule, LOOKAHEAD_MS)
  frame = requestAnimationFrame(draw)
  track('bpm_metronome_started', { bpm: bpm.value, mode: `${beatsPerBar.value}/4 ${SUBDIVISIONS.find((s) => s.value === subdivision.value)?.label ?? ''}`.trim() })

  // Keeps a phone's screen on during practice; refusal is harmless.
  try {
    wakeLock = (await navigator.wakeLock?.request('screen')) ?? null
  } catch {
    wakeLock = null
  }
}

function stop() {
  generation++
  window.clearInterval(schedulerTimer)
  if (frame !== undefined) cancelAnimationFrame(frame)
  running.value = false
  currentBeat.value = -1
  angle.value = 0
  void wakeLock?.release().catch(() => undefined)
  wakeLock = null
  // A running context holds the output device with nothing playing. start() resumes it (RBA-93).
  void ctx?.suspend().catch(() => undefined)
}

function toggle() {
  if (running.value) stop()
  else void start()
}

function tapTempo(at: number) {
  tapTimes.value = pushTap(tapTimes.value, at)
  const estimate = estimateTapTempo(tapTimes.value)
  if (estimate && tapTimes.value.length >= 3) setBpm(estimate.bpm)
}

// A changed bar or grid restarts the count on the next tick, so the downbeat
// stays where the player expects it.
watch([beatsPerBar, subdivision], () => {
  tick = 0
})
watch(volume, (v) => {
  if (master) master.gain.value = v
})

function onKeyDown(event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey || event.altKey) return
  const target = event.target instanceof HTMLElement ? event.target : null
  if (target?.closest('a, button, input, select, textarea, [contenteditable="true"]')) return
  const step = event.shiftKey ? 10 : 1
  if (event.key === ' ' && !event.repeat) toggle()
  else if (event.key === 'ArrowUp' || event.key === 'ArrowRight') setBpm(bpm.value + step)
  else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') setBpm(bpm.value - step)
  else if (event.key.toLowerCase() === 't' && !event.repeat) tapTempo(event.timeStamp)
  else return
  event.preventDefault()
}

onMounted(() => {
  const fromUrl = parseBpmParam(new URLSearchParams(window.location.search).get('bpm'))
  if (fromUrl !== null) setBpm(fromUrl)
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  stop()
  window.removeEventListener('keydown', onKeyDown)
  void ctx?.close()
  ctx = null
})
</script>

<template>
  <section
    class="tt-card metronome"
    :class="{ 'is-running': running }"
    aria-label="Metronome"
  >
    <svg
      class="pendulum"
      viewBox="0 0 200 130"
      aria-hidden="true"
    >
      <path
        class="pendulum-track"
        d="M 49 33.67 A 102 102 0 0 1 151 33.67"
      />
      <g
        class="pendulum-arm"
        :style="{ transform: `rotate(${angle}deg)` }"
      >
        <line
          x1="100"
          y1="122"
          x2="100"
          y2="20"
        />
        <rect
          class="pendulum-weight"
          x="88"
          :y="weightY - 7"
          width="24"
          height="14"
          rx="4"
        />
      </g>
      <circle
        class="pendulum-pivot"
        cx="100"
        cy="122"
        r="6"
      />
    </svg>

    <div class="bpm-control">
      <button
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
        type="button"
        class="tt-btn tt-btn-round"
        aria-label="Faster"
        @click="setBpm(bpm + 1)"
      >
        <Plus :size="18" />
      </button>
    </div>
    <p class="tt-caption">
      {{ marking }}
    </p>
    <input
      v-model.number="bpm"
      class="tt-range"
      type="range"
      :min="MIN_BPM"
      :max="MAX_BPM"
      step="1"
      aria-label="Tempo"
    />

    <div
      class="beats"
      aria-hidden="true"
    >
      <span
        v-for="i in beatsPerBar"
        :key="`${i}-${i - 1 === currentBeat ? beatFlash : 0}`"
        class="beat"
        :class="{ 'is-active': i - 1 === currentBeat, 'is-accent': i === 1 && accent }"
      ></span>
    </div>

    <div class="tt-row">
      <button
        type="button"
        class="tt-btn tt-btn-primary play"
        @click="toggle"
      >
        <Pause
          v-if="running"
          :size="20"
        />
        <Play
          v-else
          :size="20"
        />
        {{ running ? 'Stop' : 'Start' }}
      </button>
      <button
        type="button"
        class="tt-btn"
        @pointerdown="tapTempo($event.timeStamp)"
      >
        <Hand :size="15" /> Tap
      </button>
    </div>

    <div class="settings">
      <div class="tt-field">
        <span class="tt-label">Beats per bar</span>
        <div class="stepper">
          <button
            type="button"
            class="tt-btn tt-btn-round small"
            aria-label="Fewer beats per bar"
            :disabled="beatsPerBar <= 1"
            @click="beatsPerBar--"
          >
            <Minus :size="14" />
          </button>
          <span class="stepper-value">{{ beatsPerBar }}/4</span>
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
        <span class="tt-label">Subdivision</span>
        <div
          class="tt-segmented"
          role="group"
          aria-label="Subdivision"
        >
          <button
            v-for="option in SUBDIVISIONS"
            :key="option.value"
            type="button"
            :aria-pressed="subdivision === option.value"
            @click="subdivision = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
      <div class="tt-field">
        <span class="tt-label">Accent</span>
        <div
          class="tt-segmented"
          role="group"
          aria-label="Accent the first beat"
        >
          <button
            type="button"
            :aria-pressed="accent"
            @click="accent = true"
          >
            On
          </button>
          <button
            type="button"
            :aria-pressed="!accent"
            @click="accent = false"
          >
            Off
          </button>
        </div>
      </div>
      <label class="tt-field">
        <span class="tt-label">Volume</span>
        <input
          v-model.number="volume"
          class="tt-range volume"
          type="range"
          min="0"
          max="1"
          step="0.05"
        />
      </label>
    </div>

    <div class="tt-row">
      <a
        class="tt-chip"
        :href="`/bpm-to-ms?bpm=${bpm}`"
      >
        <Timer :size="15" /> Delay times at {{ bpm }} BPM
      </a>
    </div>

    <p class="tt-hint">
      <kbd>Space</kbd> start/stop · <kbd>↑</kbd><kbd>↓</kbd> ±1 (<kbd>Shift</kbd> ±10) · <kbd>T</kbd> tap
    </p>
  </section>
</template>

<style scoped>
.pendulum {
  display: block;
  width: min(260px, 80%);
  margin: 0 auto 0.5rem;
  overflow: visible;
}

.pendulum-track {
  fill: none;
  stroke: var(--vp-c-divider);
  stroke-width: 2;
  stroke-dasharray: 2 6;
  stroke-linecap: round;
}

.pendulum-arm {
  transform-origin: 100px 122px;
  transform-box: view-box;
}

.pendulum-arm line {
  stroke: var(--vp-c-text-2);
  stroke-width: 3;
  stroke-linecap: round;
}

.pendulum-weight {
  fill: var(--vp-c-brand-1);
  transition: y 0.2s ease;
}

.pendulum-pivot { fill: var(--vp-c-text-1); }

.bpm-control {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(0.75rem, 4vw, 2rem);
}

.beats {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.6rem;
  margin-top: 1.5rem;
}

.beat {
  width: 18px;
  height: 18px;
  border: 2px solid var(--vp-c-divider);
  border-radius: 50%;
  background: var(--vp-c-bg);
}

.beat.is-accent { border-color: color-mix(in srgb, var(--vp-c-brand-1) 60%, transparent); }

.beat.is-active {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-1);
  animation: beat-pop 0.25s ease-out;
}

@keyframes beat-pop {
  from { transform: scale(1.45); box-shadow: 0 0 0 6px color-mix(in srgb, var(--vp-c-brand-1) 30%, transparent); }
  to { transform: scale(1); box-shadow: 0 0 0 0 transparent; }
}

.play {
  min-width: 9rem;
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  font-weight: 600;
}

.is-running .play {
  box-shadow: 0 10px 30px -10px color-mix(in srgb, var(--vp-c-brand-1) 80%, transparent);
}

.settings {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1.25rem 1rem;
  margin-top: 1.75rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--vp-c-divider);
}

.stepper {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
}

.stepper-value {
  min-width: 3ch;
  font-size: 1.1rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.tt-btn-round.small {
  width: 2rem;
  height: 2rem;
}

.tt-range.volume {
  max-width: 160px;
  margin: 0.35rem 0 0;
}
</style>
