<script setup lang="ts">
// The strobe light (RBA-237): it flashes on each kick the library hears (its `kick` event,
// RBA-243), from the built-in demo track, a dropped song, the microphone or another tab's sound,
// with a spectrogram on which each kick appears. Every safety decision is in tools/strobe.ts,
// where node --test checks it: this component feeds it kicks and frame times, and draws what it
// returns. start() is called from the Start button's click and nowhere else, and every stop path
// ends in halt(), which releases the source. The library loads on Start, never with the page (RBA-123).
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { FileAudio, Maximize, Square, Zap } from 'lucide-vue-next'
import type { BpmAnalyzer } from 'realtime-bpm-analyzer'
import { useAnalytics } from '../composables/useAnalytics'
import { openAnalysis } from '../tools/audio-setup'
import { demoLength, renderDemo } from '../tools/demo-track'
import { classifyMicError } from '../tools/mic-error'
import { SPECTROGRAM_HEIGHT, SPECTROGRAM_WIDTH, kickX, paintColumn, rowBins, scrollPixels } from '../tools/spectrogram'
import {
  EVERY_KICK_UP_TO_BPM,
  IDLE,
  RESTART_GUARD_MS,
  STAGE_COLOR,
  addKick,
  flashAnimation,
  flashTimeFor,
  initialStyle,
  isTooSoonAfterStop,
  start as strobeStart,
  step,
  stop as strobeStop,
  type Flash,
  type FlashStyle,
  type Strobe,
  type StrobeSource,
} from '../tools/strobe'

const { track } = useAnalytics()

const STYLES: readonly { id: FlashStyle; label: string }[] = [
  { id: 'flash', label: 'Full flash' },
  { id: 'pulse', label: 'Soft pulse' },
]
/** The kicks' marks on the spectrogram: amber, apart from its blues, and far from red. */
const KICK_MARK = '#ffc940'
const FFT_SIZE = 2048
const STAYS_ON_DEVICE = 'your audio stays on your device'

const source = ref<StrobeSource>('demo')
const song = ref<File | null>(null)
const isDragOver = ref(false)
const style = ref<FlashStyle>('flash')
const reducedMotion = ref(false)
const showSpectrogram = ref(true)
const running = ref(false)
const preparing = ref(false)
const error = ref<string | null>(null)
const note = ref('')
const tempo = ref<number | null>(null)
const every = ref(1)
const canShareTab = ref(false)
const canFullscreen = ref(false)

const stage = ref<HTMLElement | null>(null)
const light = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const startButton = ref<HTMLButtonElement | null>(null)
const stopButton = ref<HTMLButtonElement | null>(null)

const sources = computed(() => [
  { id: 'demo' as const, label: 'Demo track' },
  { id: 'file' as const, label: 'Your song' },
  { id: 'mic' as const, label: 'Microphone' },
  ...(canShareTab.value ? [{ id: 'tab' as const, label: 'Another tab' }] : []),
])
const status = computed(() => {
  if (preparing.value) return source.value === 'demo' ? 'Preparing the demo…' : 'Starting…'
  const reading = tempo.value === null ? 'Listening for the beat' : `${Math.round(tempo.value)} BPM`
  const ordinal = every.value === 2 ? 'second' : every.value === 3 ? 'third' : `${every.value}th`
  return every.value > 1 ? `${reading} · flashing on every ${ordinal} kick` : reading
})

/** What a running strobe holds. halt() releases all of it, whatever has been opened so far. */
type Session = {
  context: AudioContext
  analyzer: BpmAnalyzer | null
  analyser: AnalyserNode | null
  stream: MediaStream | null
  player: AudioBufferSourceNode | null
}

let strobe: Strobe = IDLE
let session: Session | null = null
let frame: number | undefined
let generation = 0
let stoppedAt: number | null = null
let wakeLock: WakeLockSentinel | null = null

// ── Drawing ───────────────────────────────────────────────────────────────────────────────

let paint: { context: CanvasRenderingContext2D; column: ImageData; levels: Uint8Array<ArrayBuffer>; rows: Uint16Array } | null = null
let lastDraw = 0
let scrollCarry = 0
/** Kick times not yet marked on the spectrogram, in order. */
let marks: number[] = []

function onFrame(now: number) {
  const result = step(strobe, now)
  strobe = result.state
  if (result.flash) show(result.flash)
  if (every.value !== strobe.every) every.value = strobe.every
  if (showSpectrogram.value) drawSpectrogram(now)
  frame = requestAnimationFrame(onFrame)
}

// The Web Animations API runs the flash off the main thread's style work, and cancel() ends it at once.
function show(flash: Flash) {
  const { color, peakOpacity, attackMs, decayMs } = flashAnimation(style.value, flash.strength, flash.intervalMs)
  const keyframes = attackMs === 0
    ? [{ opacity: peakOpacity, backgroundColor: color }, { opacity: peakOpacity, backgroundColor: color, offset: 0.4 }, { opacity: 0, backgroundColor: color }]
    : [{ opacity: 0, backgroundColor: color }, { opacity: peakOpacity, backgroundColor: color, offset: attackMs / (attackMs + decayMs) }, { opacity: 0, backgroundColor: color }]
  light.value?.animate(keyframes, { duration: attackMs + decayMs, easing: attackMs === 0 ? 'linear' : 'ease-in-out' })
}

/** Scrolls the spectrogram by the time since the last frame, and marks each kick whose time has come. */
function drawSpectrogram(now: number) {
  const analyser = session?.analyser
  if (!paint || !analyser || !canvas.value) return
  const { pixels, carry } = scrollPixels(now - lastDraw, scrollCarry)
  lastDraw = now
  scrollCarry = carry
  const { context, column, levels, rows } = paint
  if (pixels > 0) {
    context.drawImage(canvas.value, -pixels, 0)
    analyser.getByteFrequencyData(levels)
    paintColumn(levels, rows, column.data)
    for (let x = SPECTROGRAM_WIDTH - pixels; x < SPECTROGRAM_WIDTH; x++) context.putImageData(column, x, 0)
  }
  context.fillStyle = KICK_MARK
  while (marks.length && (marks[0] as number) <= now) {
    const at = marks.shift() as number
    context.fillRect(Math.round(kickX(now - at)) - 1, 0, 2, SPECTROGRAM_HEIGHT)
  }
}

function prepareSpectrogram(analyser: AnalyserNode, sampleRate: number) {
  const context = canvas.value?.getContext('2d', { alpha: false })
  if (!context) return
  context.fillStyle = STAGE_COLOR
  context.fillRect(0, 0, SPECTROGRAM_WIDTH, SPECTROGRAM_HEIGHT)
  paint = {
    context,
    column: context.createImageData(1, SPECTROGRAM_HEIGHT),
    levels: new Uint8Array(analyser.frequencyBinCount),
    rows: rowBins(SPECTROGRAM_HEIGHT, analyser.fftSize, sampleRate),
  }
  lastDraw = performance.now()
  scrollCarry = 0
}

// ── Start and stop ────────────────────────────────────────────────────────────────────────

/** The only start: the Start button's click, after the warning above it. */
async function startFromClick(event: MouseEvent) {
  if (running.value || isTooSoonAfterStop(stoppedAt, event.timeStamp)) return
  error.value = null
  note.value = ''
  const chosen = source.value
  const file = song.value
  if (chosen === 'file' && !file) {
    error.value = 'Choose or drop a song first.'
    return
  }
  const gen = ++generation
  // Made in the click, so every browser lets it play; nothing plays until the source is open.
  const held: Session = { context: new AudioContext(), analyzer: null, analyser: null, stream: null, player: null }
  session = held
  strobe = strobeStart(strobe)
  marks = []
  tempo.value = null
  running.value = true
  preparing.value = true
  track('bpm_strobe_started', { audio_source: chosen })
  frame = requestAnimationFrame(onFrame)
  // The share and the mic ask the browser first, within the click's user activation.
  const asking = chosen === 'tab' ? shareTab() : chosen === 'mic' ? openMic() : null
  await nextTick()
  // The stage is fixed to the window, and preventScroll keeps the page behind it where it was.
  stopButton.value?.focus({ preventScroll: true })
  void keepAwake(gen)
  await openSource(gen, held, chosen, asking, file)
}

/** Opens the chosen source into `held`, and starts the analyzer, the kicks and the music. */
async function openSource(gen: number, held: Session, chosen: StrobeSource, asking: Promise<MediaStream> | null, file: File | null) {
  try {
    held.stream = asking ? await asking : null
    if (gen !== generation) return release(held)
    const buffer = held.stream ? null : chosen === 'demo' ? await renderDemoTrack(held.context.sampleRate) : await decode(held.context, file)
    if (gen !== generation) return release(held)
    const { createRealtimeBpmAnalyzer } = await import('realtime-bpm-analyzer')
    if (gen !== generation) return release(held)
    const liveInput = held.stream?.getAudioTracks()[0]
    const { analyzer } = await openAnalysis(
      () => held.context,
      (context) => createRealtimeBpmAnalyzer(context, liveInput ? { liveInput } : {}),
      () => release(held),
    )
    held.analyzer = analyzer
    if (gen !== generation) return release(held)
    listen(gen, held, chosen, analyzer)
    connect(gen, held, buffer, liveInput)
    preparing.value = false
  } catch (failure) {
    release(held)
    if (gen !== generation) return
    console.error('[StrobeLight] start failed:', failure)
    await stopWithError(gen, startError(chosen, failure))
  }
}

/** The kicks feed the light and the spectrogram; the readings, the tempo beside it. */
function listen(gen: number, held: Session, chosen: StrobeSource, analyzer: BpmAnalyzer) {
  analyzer.on('kick', ({ contextTime, strength }) => {
    if (gen !== generation) return
    const { context } = held
    const at = flashTimeFor(chosen, contextTime, { now: performance.now(), currentTime: context.currentTime, baseLatency: context.baseLatency, outputLatency: context.outputLatency })
    strobe = addKick(strobe, at, strength)
    marks = [...marks, at].slice(-32)
  })
  analyzer.on('reading', (reading) => {
    if (gen === generation && analyzer.state.status === 'locked') tempo.value = reading.bpm
  })
  analyzer.on('statechange', ({ to }) => {
    if (gen !== generation) return
    if (to.status === 'locked') tempo.value = to.reading.bpm
    if (to.status === 'listening' && (to.reason === 'pulse-lost' || to.reason === 'audio-lost')) tempo.value = null
    if (to.status === 'stopped' && to.error) void stopWithError(gen, 'The analysis stopped. Try again.')
  })
}

/** Wires the source to the analyzer and the spectrogram; a song also to the speakers, and plays it. */
function connect(gen: number, held: Session, buffer: AudioBuffer | null, liveInput: MediaStreamTrack | undefined) {
  const { context } = held
  const analyzer = held.analyzer as BpmAnalyzer
  const analyser = context.createAnalyser()
  analyser.fftSize = FFT_SIZE
  analyser.smoothingTimeConstant = 0.3
  held.analyser = analyser
  prepareSpectrogram(analyser, context.sampleRate)
  if (held.stream) {
    // The mic and the tab are heard in the room already: analysed, never played back.
    const input = context.createMediaStreamSource(held.stream)
    input.connect(analyzer.input)
    input.connect(analyser)
    liveInput?.addEventListener('ended', () => void stopIf(gen))
    return
  }
  const player = context.createBufferSource()
  player.buffer = buffer
  player.connect(context.destination)
  player.connect(analyzer.input)
  player.connect(analyser)
  player.addEventListener('ended', () => void stopIf(gen, 'The track ended.'))
  held.player = player
  player.start()
}

async function renderDemoTrack(sampleRate: number): Promise<AudioBuffer> {
  const offline = new OfflineAudioContext(2, demoLength(sampleRate), sampleRate)
  return renderDemo(offline)
}

async function decode(context: AudioContext, file: File | null): Promise<AudioBuffer> {
  if (!file) throw new Error('no file')
  try {
    return await context.decodeAudioData(await file.arrayBuffer())
  } catch (failure) {
    throw new DecodeError(String(failure))
  }
}

class DecodeError extends Error {}
class NoTabSound extends Error {}

/** The microphone, with the voice processing off so music isn't cancelled as echo or flattened. */
function openMic(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    video: false,
  })
}

type FocusController = { setFocusBehavior(behavior: 'no-focus-change' | 'focus-captured-surface'): void }

/**
 * Another tab's sound. The browser's picker needs video too, so its track is stopped at once:
 * the page only listens. Chrome moves focus to the shared tab by default, which would hide this
 * one and stop the light (the hidden-tab rule stays), so it is asked to keep this tab in front.
 */
async function shareTab(): Promise<MediaStream> {
  const Controller = (globalThis as { CaptureController?: new () => FocusController }).CaptureController
  const controller = Controller ? new Controller() : undefined
  const keepFocus = () => {
    try {
      controller?.setFocusBehavior('no-focus-change')
    } catch {
      // Too early before Chrome 124, too late after the capture's first task: either way the try is all there is.
    }
  }
  keepFocus()
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    controller,
    selfBrowserSurface: 'exclude',
  } as Parameters<MediaDevices['getDisplayMedia']>[0])
  keepFocus()
  for (const video of stream.getVideoTracks()) {
    video.stop()
    stream.removeTrack(video)
  }
  if (stream.getAudioTracks().length === 0) {
    stream.getTracks().forEach((t) => t.stop())
    throw new NoTabSound()
  }
  return stream
}

function startError(chosen: StrobeSource, failure: unknown): string {
  if (failure instanceof DecodeError) return 'Your browser couldn’t decode that file. Try MP3, WAV, FLAC, M4A or OGG.'
  if (failure instanceof NoTabSound) return 'That share has no sound. Pick a browser tab, and leave “Also share tab audio” on.'
  const denied = failure instanceof DOMException && failure.name === 'NotAllowedError'
  if (chosen === 'tab') return denied ? 'Sharing was cancelled. Press Start and pick the tab with the music.' : 'Couldn’t share a tab. Try again.'
  if (chosen === 'mic') {
    return classifyMicError(failure).error_kind === 'denied'
      ? 'Microphone access denied. Enable it in your browser settings and try again.'
      : 'Couldn’t start the microphone. Check your device and try again.'
  }
  return 'Couldn’t play the track. Try again.'
}

/** Releases everything a session holds. Safe on a partial session, and more than once. */
function release(held: Session) {
  try {
    held.player?.stop()
  } catch {
    // Never started: nothing to stop.
  }
  try {
    held.analyzer?.stop()
    held.analyzer?.disconnect()
  } catch (e) {
    console.debug('[StrobeLight] analyzer dispose:', e)
  }
  held.stream?.getTracks().forEach((t) => t.stop())
  if (held.context.state !== 'closed') held.context.close().catch((e) => console.debug('[StrobeLight] context close:', e))
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
  preparing.value = false
  tempo.value = null
  every.value = 1
  marks = []
  paint = null
  void wakeLock?.release().catch(() => undefined)
  wakeLock = null
  if (session) release(session)
  session = null
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
}

/** A source that ends by itself (the song, the mic, the share) stops the light if it is still its run. */
async function stopIf(gen: number, message = '') {
  if (gen !== generation) return
  await stopAndRefocus()
  note.value = message
}

/**
 * The browser's click from a tap that stops the light lands on what the stage uncovered: the
 * nav, a link, a setting. It is swallowed once, before anything sees it; if no click comes, the
 * listener goes after RESTART_GUARD_MS so a later click works.
 */
function swallowGhostClick() {
  const swallow = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }
  window.addEventListener('click', swallow, { capture: true, once: true })
  setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), RESTART_GUARD_MS)
}

/** A tap anywhere on the light. */
function stopFromTap() {
  swallowGhostClick()
  void stopAndRefocus()
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

// Shown once the setup panel is back, so the alert is announced and Start describes it.
async function stopWithError(gen: number, message: string) {
  if (gen !== generation) return
  await stopAndRefocus()
  error.value = message
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

// ── Your song ─────────────────────────────────────────────────────────────────────────────

function chooseSong(file: File | undefined) {
  if (!file) return
  song.value = file
  source.value = 'file'
  error.value = null
}

function openFilePicker() {
  fileInput.value?.click()
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  chooseSong(input.files?.[0])
  input.value = ''
}

// A song dropped anywhere on the setup is chosen, whatever source was picked. Only Start plays it.
function onDrop(event: DragEvent) {
  isDragOver.value = false
  chooseSong(event.dataTransfer?.files?.[0])
}

// ── Keys and page events ──────────────────────────────────────────────────────────────────

// Listened to in the capture phase. While it runs, the stage is modal: no key reaches the page
// behind it, such as the site search's / or Ctrl+K, which opened over the light and fought the
// stage for focus. Default actions still happen, so Enter on Stop and Tab work.
function onKeyDown(event: KeyboardEvent) {
  if (!running.value) return
  event.stopPropagation()
  if (event.metaKey || event.ctrlKey || event.altKey) return
  if (event.key === 'Escape' || event.key === ' ') {
    event.preventDefault()
    void stopAndRefocus()
  }
}

// While it runs the stage covers the page, so Tab can't reach controls hidden behind the light:
// focus that leaves the stage wraps round its controls, to the last from Stop (Shift+Tab), else to Stop.
function onFocusIn(event: FocusEvent) {
  if (!running.value || !(event.target instanceof Node) || stage.value?.contains(event.target)) return
  const controls = [...(stage.value?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
  const next = event.relatedTarget === stopButton.value ? controls[controls.length - 1] : stopButton.value
  next?.focus({ preventScroll: true })
}

// A hidden tab stops it, the shared tab's included: the visitor starts the music there first.
function onVisibility() {
  if (document.visibilityState === 'hidden') void stopAndRefocus()
}

// Esc in full screen goes to the browser, which leaves full screen: that is a stop too.
function onFullscreenChange() {
  if (!document.fullscreenElement && running.value) void stopAndRefocus()
}

/** A tab's sound can be shared in Chromium on a computer; Firefox and Safari share no tab audio. */
function tabSoundShareable(): boolean {
  const agent = (navigator as { userAgentData?: { brands?: { brand: string }[]; mobile?: boolean } }).userAgentData
  return typeof navigator.mediaDevices?.getDisplayMedia === 'function'
    && agent?.mobile === false
    && (agent.brands ?? []).some(({ brand }) => brand === 'Chromium')
}

onMounted(() => {
  style.value = initialStyle(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  reducedMotion.value = style.value === 'pulse'
  // The spectrogram scrolls, so under reduced motion it is off until asked for, like the full flash.
  showSpectrogram.value = !reducedMotion.value
  canShareTab.value = tabSoundShareable()
  canFullscreen.value = document.fullscreenEnabled === true
  window.addEventListener('keydown', onKeyDown, { capture: true })
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', stopAndRefocus)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  document.addEventListener('focusin', onFocusIn)
})

onBeforeUnmount(() => {
  halt()
  window.removeEventListener('keydown', onKeyDown, { capture: true })
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
      :class="{ 'is-drag-over': isDragOver }"
      @dragover.prevent="isDragOver = true"
      @dragleave="isDragOver = false"
      @drop.prevent="onDrop"
    >
      <div class="tt-field">
        <span class="tt-label">Music from</span>
        <div
          class="tt-segmented strobe-sources"
          role="group"
          aria-label="Music source"
        >
          <button
            v-for="option in sources"
            :key="option.id"
            type="button"
            :aria-pressed="source === option.id"
            @click="source = option.id"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <p
        v-if="source === 'demo'"
        class="strobe-note"
      >
        30 seconds of techno made for this page: a steady kick, a breakdown where the kick and the
        light stop, then the drop. It plays when you press Start.
      </p>
      <div
        v-else-if="source === 'file'"
        class="strobe-drop"
        @click="openFilePicker"
      >
        <FileAudio
          class="strobe-drop-icon"
          :size="36"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        <p class="strobe-drop-headline">
          <template v-if="song">
            {{ song.name }}
          </template>
          <template v-else>
            <span class="strobe-on-pointer">Drop a song or choose a file</span>
            <span class="strobe-on-touch">Choose a song</span>
          </template>
        </p>
        <button
          type="button"
          class="tt-btn"
          @click.stop="openFilePicker"
        >
          {{ song ? 'Choose another file' : 'Choose a file' }}
        </button>
        <p class="tt-caption">
          MP3, WAV, FLAC, M4A, OGG. It plays in this page, and {{ STAYS_ON_DEVICE }}.
        </p>
        <input
          ref="fileInput"
          type="file"
          accept="audio/*"
          class="strobe-file-input"
          aria-label="Choose a song"
          tabindex="-1"
          @change="onFileChange"
        />
      </div>
      <p
        v-else-if="source === 'mic'"
        class="strobe-note"
      >
        Play music near your device and press Start. The kicks are found in your browser, and
        {{ STAYS_ON_DEVICE }}.
      </p>
      <p
        v-else
        class="strobe-note"
      >
        Start the music in the other tab first. Then press Start, pick that tab, and leave “Also
        share tab audio” on. This tab stays in front: switching to the other tab stops the light,
        as any hidden tab does. The page only listens, and {{ STAYS_ON_DEVICE }}.
      </p>
      <p
        v-if="!canShareTab"
        class="strobe-note"
      >
        Sharing another tab’s sound works in Chrome and Edge on a computer.
      </p>

      <div class="strobe-settings">
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
        <div class="tt-field">
          <span class="tt-label">Spectrogram</span>
          <div
            class="tt-segmented"
            role="group"
            aria-label="Spectrogram"
          >
            <button
              type="button"
              :aria-pressed="showSpectrogram"
              @click="showSpectrogram = true"
            >
              Show
            </button>
            <button
              type="button"
              :aria-pressed="!showSpectrogram"
              @click="showSpectrogram = false"
            >
              Hide
            </button>
          </div>
        </div>
      </div>
      <p
        v-if="reducedMotion"
        class="strobe-note"
      >
        Your device asks for reduced motion, so the soft pulse is chosen and the scrolling
        spectrogram is hidden. Pick Full flash or Show only if you want them.
      </p>

      <div
        id="strobe-warning"
        class="strobe-warning"
      >
        <strong>Photosensitivity warning.</strong> This tool flashes the screen, which can trigger
        seizures in people with photosensitive epilepsy. It flashes at most three times a second, and
        above {{ EVERY_KICK_UP_TO_BPM }} BPM on every second kick. Stop it at any time with Esc, Space, the Stop button or a
        tap on the light.
      </div>
      <p
        v-if="error"
        id="strobe-error"
        class="strobe-error"
        role="alert"
      >
        {{ error }}
      </p>
      <p
        class="strobe-note"
        role="status"
        v-text="note"
      ></p>
      <div class="tt-row">
        <button
          ref="startButton"
          type="button"
          class="tt-btn tt-btn-primary strobe-start"
          :aria-describedby="error ? 'strobe-error strobe-warning' : 'strobe-warning'"
          @keydown.enter="onStartKey"
          @click="startFromClick"
        >
          <Zap :size="20" /> Start the strobe
        </button>
      </div>
      <p class="tt-hint">
        <kbd>Esc</kbd> or <kbd>Space</kbd> stop
      </p>
    </div>

    <div
      v-show="running"
      ref="stage"
      class="strobe-stage"
      role="dialog"
      aria-modal="true"
      aria-label="Strobe light running"
      @pointerdown.prevent="stopFromTap"
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
        <div
          v-show="showSpectrogram"
          class="strobe-spectrogram"
        >
          <canvas
            ref="canvas"
            :width="SPECTROGRAM_WIDTH"
            :height="SPECTROGRAM_HEIGHT"
            role="img"
            aria-label="Spectrogram of the music, with a mark at each kick"
          ></canvas>
          <p
            class="strobe-tempo"
            aria-hidden="true"
          >
            <span class="strobe-tempo-number">{{ tempo === null ? '–' : Math.round(tempo) }}</span>
            <span class="strobe-tempo-unit">BPM</span>
          </p>
        </div>
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
  border-radius: 12px;
}

.strobe-setup.is-drag-over { outline: 2px dashed var(--vp-c-brand-1); outline-offset: 6px; }

.strobe-sources { flex-wrap: wrap; }

/* The song's drop target, as on the BPM tool's file panel. */
.strobe-drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 1.5rem 1rem;
  border: 2px dashed var(--vp-c-divider);
  border-radius: 14px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.strobe-drop:hover,
.is-drag-over .strobe-drop {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

.strobe-drop-icon { color: var(--vp-c-brand-1); }

.strobe-drop-headline {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.strobe-drop .tt-caption { margin: 0; }

.strobe-file-input { display: none; }

/* A touch screen has nothing to drop: the same check as the BPM tool's. */
.strobe-on-touch { display: none; }

@media (pointer: coarse) {
  .strobe-on-pointer { display: none; }
  .strobe-on-touch { display: inline; }
}

.strobe-settings {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1.25rem 1rem;
}

.strobe-note,
.strobe-error {
  margin: 0;
  font-size: 0.9rem;
  color: var(--vp-c-text-2);
}

.strobe-note:empty { display: none; }

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

/* One strip at the bottom. The safe-area insets are 0 until the site's viewport sets viewport-fit=cover. */
.strobe-controls {
  position: relative;
  padding: 0.75rem 0.75rem calc(0.75rem + env(safe-area-inset-bottom));
  background: rgb(0 0 0 / 0.85);
  cursor: default;
}

/* The spectrogram, with the library's tempo beside it. Its canvas is small and CSS stretches it. */
.strobe-spectrogram {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  max-width: 48rem;
  margin: 0 auto 0.75rem;
}

.strobe-spectrogram canvas {
  flex: 1 1 auto;
  min-width: 0;
  height: clamp(4rem, 14vh, 7rem);
  border-radius: 6px;
  background: v-bind(STAGE_COLOR);
}

.strobe-tempo {
  display: grid;
  margin: 0;
  text-align: center;
  line-height: 1.1;
}

.strobe-tempo-number {
  font-size: 1.6rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.strobe-tempo-unit {
  font-size: 0.8rem;
  color: #c8c8c8;
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
