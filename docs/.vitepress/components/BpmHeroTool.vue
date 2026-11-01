<script setup lang="ts">
import { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import {
  FileAudio,
  Mic,
  MonitorUp,
  Radio,
  Volume2,
  VolumeX,
  ShieldCheck,
} from 'lucide-vue-next'
import {
  analyzeFullBuffer,
  createRealtimeBpmAnalyzer,
  type BpmAnalyzer,
  type BpmCandidates,
} from 'realtime-bpm-analyzer'
import { useAnalytics } from '../composables/useAnalytics'
import { fileExtensionParam } from '../tools/analytics-params'
import { decodeAndClose, openAnalysis } from '../tools/audio-setup'
import {
  PLATFORM_LABELS,
  STATIONS,
  STREAM_ERROR_MESSAGES,
  classifyTabCaptureError,
  detectPlatform,
  diagnoseStreamFailure,
  streamEventParams,
  supportsTabAudio,
  type NavigatorLike,
  type StreamEventParams,
  type StreamErrorKind,
  type TabCaptureFailure,
} from '../tools/stream-input'
import GithubStarSupport from './GithubStarSupport.vue'
import ResultToolLinks from './ResultToolLinks.vue'
import { STORE_URL } from '../tools/extension-live'
import { EXTENSION_PAGE, extensionCovers } from '../tools/extension-promo'

type Mode = 'file' | 'mic' | 'stream'
type Status = 'idle' | 'analysing' | 'result' | 'error'

// Magic numbers — named for grep-ability.
const STREAM_STABILIZATION_MS = 20_000
const GAIN_UNMUTED = 1
const GAIN_MUTED = 0

const { track } = useAnalytics()

const mode = ref<Mode>('file')

// ─── Generation token ────────────────────────────────────────────────────
// Every time an in-flight audio setup could be invalidated (mode switch, stop,
// unmount), `invalidate()` increments the counter. Async setups capture their
// generation at start; after each `await` they bail if the counter has moved.
// Prevents orphaned AudioContext / BpmAnalyzer after a fast user swap.
let generation = 0
const invalidate = () => ++generation

// ─── File ────────────────────────────────────────────────────────────────
const fileInput = ref<HTMLInputElement | null>(null)
const isDragOver = ref(false)
const fileStatus = ref<Status>('idle')
const fileName = ref<string | null>(null)
const fileBpm = ref<number | null>(null)
const fileDuration = ref<number | null>(null)
const fileElapsedMs = ref<number | null>(null)
const fileError = ref<string | null>(null)

// ─── Mic ─────────────────────────────────────────────────────────────────
const micStatus = ref<Status>('idle')
const micLiveBpm = ref<number | null>(null)
const micStableBpm = ref<number | null>(null)
const micError = ref<string | null>(null)
// `shallowRef` for audio graph nodes — Vue shouldn't deep-track them (they're
// not reactive targets) and we want consistent `.value = null` semantics.
const micContext = shallowRef<AudioContext | null>(null)
const micStream = shallowRef<MediaStream | null>(null)
const micAnalyzer = shallowRef<BpmAnalyzer | null>(null)

// ─── Stream ──────────────────────────────────────────────────────────────
const streamUrl = ref('https://ice1.somafm.com/defcon-128-mp3')
const streamStatus = ref<Status>('idle')
const streamLiveBpm = ref<number | null>(null)
const streamStableBpm = ref<number | null>(null)
const streamError = ref<string | null>(null)
const streamMuted = ref(false)
const streamContext = shallowRef<AudioContext | null>(null)
const streamAudioEl = shallowRef<HTMLAudioElement | null>(null)
const streamAnalyzer = shallowRef<BpmAnalyzer | null>(null)
const streamGain = shallowRef<GainNode | null>(null)
const streamErrorHandler = shallowRef<((event: Event) => void) | null>(null)
// What feeds the live stream panel: a URL through an <audio> element, or another
// tab's audio shared through getDisplayMedia (RBA-23).
const streamInput = ref<'url' | 'tab'>('url')
const streamTabCapture = shallowRef<MediaStream | null>(null)
// The user pressed Chrome's "Stop sharing" after a stable reading: keep the BPM on screen.
const tabSharingEnded = ref(false)
// Decided on mount, not during SSR, because it reads `navigator`.
const tabAudioSupported = ref(false)

// A YouTube, Spotify… link can never play here: those sites stream through their
// own player and send no CORS headers. Detect it as the user pastes, before any request.
const linkPlatform = computed(() => detectPlatform(streamUrl.value))
const linkPlatformLabel = computed(() => (linkPlatform.value ? PLATFORM_LABELS[linkPlatform.value] : ''))

// Lane privacy rule: only the platform name, never the link or any part of it.
// Once per platform per page view, so clearing and re-pasting doesn't count twice.
const reportedPlatforms = new Set<string>()
watch(linkPlatform, (platform) => {
  if (!platform || reportedPlatforms.has(platform)) return
  reportedPlatforms.add(platform)
  track('bpm_link_detected', { platform })
})

const modes: readonly { id: Mode; label: string }[] = [
  { id: 'file', label: 'File' },
  { id: 'mic', label: 'Mic' },
  { id: 'stream', label: 'Stream' },
] as const

const iconForMode = {
  file: FileAudio,
  mic: Mic,
  stream: Radio,
} as const

// ─── Mode switching (with teardown) ──────────────────────────────────────
function setMode(next: Mode) {
  if (mode.value === next) return
  invalidate()
  // Leaving a mode stops its audio, so only a finished mic result may stay on
  // screen. A live panel or a pending "Checking why…" would show nothing running.
  if (mode.value === 'mic') {
    teardownMic()
    if (micStatus.value !== 'result') {
      micStatus.value = 'idle'
      micLiveBpm.value = null
      micError.value = null
    }
  }
  if (mode.value === 'stream') {
    teardownStream()
    streamStatus.value = 'idle'
    resetStreamReadings()
  }
  mode.value = next
  track('bpm_tab_change', { mode: next })
}

// ─── File flow ───────────────────────────────────────────────────────────
function openFilePicker() {
  fileInput.value?.click()
}

function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  analyseFile(file, 'browse')
  target.value = ''
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  isDragOver.value = false
  const file = event.dataTransfer?.files?.[0]
  if (!file) return
  analyseFile(file, 'drop')
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
  isDragOver.value = true
}

function onDragLeave() {
  isDragOver.value = false
}

// `input_method`, not `source`: GA4 reads an event parameter named `source` as the
// session's traffic source, which credited 1,237 sessions to "drop"/"browse" (RBA-2).
async function analyseFile(file: File, inputMethod: 'drop' | 'browse') {
  fileName.value = file.name
  fileStatus.value = 'analysing'
  fileError.value = null
  fileBpm.value = null
  fileDuration.value = null
  fileElapsedMs.value = null

  const extension = fileExtensionParam(file.name)
  track('bpm_file_selected', {
    input_method: inputMethod,
    size_kb: Math.round(file.size / 1024),
    extension,
  })

  const started = performance.now()
  // Which step failed decides both the message and the error_kind: the browser not
  // decoding the file is a format problem, a decoded file with no beat is not.
  let stage: 'decode' | 'analyse' = 'decode'

  try {
    const arrayBuffer = await file.arrayBuffer()
    const audioBuffer = await decodeAndClose(new AudioContext(), arrayBuffer)
    stage = 'analyse'
    const candidates = await analyzeFullBuffer(audioBuffer)

    const top = candidates?.[0]?.tempo
    if (top === undefined) throw new Error('No BPM candidate returned')

    fileBpm.value = Math.round(top)
    fileDuration.value = audioBuffer.duration
    fileElapsedMs.value = Math.round(performance.now() - started)
    fileStatus.value = 'result'

    track('bpm_file_result', {
      input_method: inputMethod,
      bpm: fileBpm.value,
      duration_s: Math.round(fileDuration.value),
      elapsed_ms: fileElapsedMs.value,
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown'
    fileError.value = stage === 'decode'
      ? 'Your browser couldn’t decode that file. Try MP3, WAV, FLAC, M4A or OGG.'
      : 'No clear beat found in that file. Try a section with drums or bass.'
    fileStatus.value = 'error'
    track('bpm_file_error', {
      input_method: inputMethod,
      error_kind: stage === 'decode' ? 'decode_failed' : 'no_bpm',
      extension,
      reason,
    })
    console.error('[BpmHeroTool] file analysis failed:', error)
  }
}

function restartFile() {
  track('bpm_file_restart')
  fileStatus.value = 'idle'
  fileName.value = null
  fileBpm.value = null
  fileDuration.value = null
  fileElapsedMs.value = null
  fileError.value = null
}

// ─── Mic flow ────────────────────────────────────────────────────────────
async function startMic(entry: 'mic_tab' | 'link_fallback' = 'mic_tab') {
  if (micStatus.value !== 'idle') return

  track('bpm_mic_clicked', { input_method: entry })

  micError.value = null
  micLiveBpm.value = null
  micStableBpm.value = null
  micStatus.value = 'analysing'

  // Capture the generation at entry. If anything invalidates it mid-setup
  // (mode switch, stop, unmount), bail and tear down the locals we've built
  // so far — they were never committed to component state.
  const gen = ++generation

  try {
    // Disable the voice-mode filters so music from the device's own speakers
    // isn't cancelled as echo (and the beat isn't flattened by AGC/denoise).
    const localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    })
    if (gen !== generation) return disposeLocalMic(localStream, null, null)

    const { context: localContext, analyzer: localAnalyzer } = await openAnalysis(
      () => new AudioContext(),
      context => createRealtimeBpmAnalyzer(context),
      () => localStream.getTracks().forEach(t => t.stop()),
    )
    if (gen !== generation) return disposeLocalMic(localStream, localContext, localAnalyzer)

    // Commit the locals to component state only after all awaits succeed.
    micStream.value = localStream
    micContext.value = localContext
    micAnalyzer.value = localAnalyzer

    const source = localContext.createMediaStreamSource(localStream)
    source.connect(localAnalyzer.node)
    // Intentionally do NOT connect to destination — avoids mic feedback.

    localAnalyzer.on('bpm', (data: BpmCandidates) => {
      const top = data.bpm?.[0]?.tempo
      if (top === undefined) return
      micLiveBpm.value = Math.round(top)
    })

    localAnalyzer.on('bpmStable', (data: BpmCandidates) => {
      const top = data.bpm?.[0]?.tempo
      if (top === undefined) return
      const bpm = Math.round(top)
      // bpmStable repeats on every qualifying chunk (~1/s): report a tempo once, and
      // again only when it changes (RBA-5).
      if (bpm !== micStableBpm.value) track('bpm_mic_stable', { bpm })
      micStableBpm.value = bpm
      micStatus.value = 'result'
    })
  } catch (error) {
    if (gen !== generation) return // invalidated during setup — bail quietly
    const reason = error instanceof Error ? error.message : 'unknown'
    const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')
    micError.value = denied
      ? 'Microphone access denied. Enable it in your browser settings and try again.'
      : 'Couldn’t start the microphone. Check your device and try again.'
    micStatus.value = 'error'
    track('bpm_mic_error', { reason })
    console.error('[BpmHeroTool] mic setup failed:', error)
    // openAnalysis released what it opened. This covers what was already committed.
    teardownMic()
  }
}

// Dispose locals that were never promoted to component state (race path).
function disposeLocalMic(
  stream: MediaStream | null,
  context: AudioContext | null,
  analyzer: BpmAnalyzer | null,
) {
  try { analyzer?.stop(); analyzer?.disconnect() } catch (e) { console.debug('[BpmHeroTool] mic dispose analyzer:', e) }
  stream?.getTracks().forEach(t => t.stop())
  context?.close().catch((e) => console.debug('[BpmHeroTool] mic dispose context:', e))
}

function teardownMic() {
  try {
    micAnalyzer.value?.stop()
    micAnalyzer.value?.disconnect()
  } catch (e) {
    console.debug('[BpmHeroTool] teardownMic analyzer:', e)
  }
  micAnalyzer.value = null
  micStream.value?.getTracks().forEach(t => t.stop())
  micStream.value = null
  micContext.value?.close().catch((e) => console.debug('[BpmHeroTool] teardownMic context:', e))
  micContext.value = null
}

function stopMic() {
  track('bpm_mic_stopped')
  invalidate()
  teardownMic()
  micStatus.value = 'idle'
  micLiveBpm.value = null
  micStableBpm.value = null
  micError.value = null
}

// ─── Stream flow ─────────────────────────────────────────────────────────
// Note: with `continuousAnalysis: true` the analyzer keeps running after the
// first stable detection — a live radio stream has no natural "end". We
// therefore stay in the `'analysing'` status and surface the stable reading
// as a prominent pill inside the same panel, rather than transitioning to
// `'result'` (which would imply the session is finished).
function resetStreamReadings() {
  streamError.value = null
  streamLiveBpm.value = null
  streamStableBpm.value = null
  tabSharingEnded.value = false
}

function listenToStreamAnalyzer(analyzer: BpmAnalyzer, stableParams: StreamEventParams | { input_method: 'tab' }) {
  analyzer.on('bpm', (data: BpmCandidates) => {
    const top = data.bpm?.[0]?.tempo
    if (top === undefined) return
    streamLiveBpm.value = Math.round(top)
  })

  analyzer.on('bpmStable', (data: BpmCandidates) => {
    const top = data.bpm?.[0]?.tempo
    if (top === undefined) return
    const bpm = Math.round(top)
    if (bpm !== streamStableBpm.value) track('bpm_stream_stable', { bpm, ...stableParams })
    streamStableBpm.value = bpm
  })
}

// The <audio> element only says "error". Show the failure at once, then ask the
// server why (cors / network / decode / http / insecure) and send the one report
// with that reason. The caller guarantees this runs once per attempt (RBA-4).
async function reportStreamFailure(gen: number, url: string, eventParams: StreamEventParams, reason: string, knownKind?: StreamErrorKind) {
  teardownStream()
  streamError.value = 'Couldn’t play that stream. Checking why…'
  streamStatus.value = 'error'
  const kind = knownKind ?? await diagnoseStreamFailure(url, window.location.protocol, (u, init) => fetch(u, init))
  track('bpm_stream_error', { ...eventParams, reason, error_kind: kind })
  // The user may have moved on while the probe ran: report, but leave their new state alone.
  if (gen !== generation) return
  streamError.value = STREAM_ERROR_MESSAGES[kind]
}

async function startStream() {
  if (streamStatus.value !== 'idle') return
  const url = streamUrl.value.trim()
  // A platform link gets the alternatives instead, and never reaches analytics.
  if (!url || linkPlatform.value) return

  // Station, scheme and format, never the URL itself (RBA-35).
  const eventParams = streamEventParams(url)
  track('bpm_stream_clicked', { ...eventParams })

  resetStreamReadings()
  streamInput.value = 'url'
  streamStatus.value = 'analysing'

  const gen = ++generation
  // A source that answers but fails (404, CORS) fires the element's `error` event
  // AND rejects play(): whichever comes first reports it, once (RBA-4).
  let reported = false
  const fail = (reason: string, knownKind?: StreamErrorKind) => {
    if (reported) return
    reported = true
    void reportStreamFailure(gen, url, eventParams, reason, knownKind)
  }

  try {
    const localAudioEl = new Audio()
    localAudioEl.crossOrigin = 'anonymous'
    localAudioEl.src = url
    localAudioEl.preload = 'auto'

    const { context: localContext, analyzer: localAnalyzer } = await openAnalysis(
      () => new AudioContext(),
      context => createRealtimeBpmAnalyzer(context, {
        continuousAnalysis: true,
        stabilizationTime: STREAM_STABILIZATION_MS,
      }),
      () => disposeLocalStream(localAudioEl, null, null, null),
    )
    if (gen !== generation) return disposeLocalStream(localAudioEl, localContext, localAnalyzer, null)

    // Committed before anything else can throw, so that a failure below is torn down with the rest.
    streamAudioEl.value = localAudioEl
    streamContext.value = localContext
    streamAnalyzer.value = localAnalyzer

    const source = localContext.createMediaElementSource(localAudioEl)
    // Analyzer is a sink — it consumes audio for BPM detection and produces no
    // output. Branch two parallel chains from the source so audio still reaches
    // the speakers while we analyse:
    //   source → analyzer.node                    (analysis path)
    //   source → gainNode → destination           (audio playback, mutable)
    source.connect(localAnalyzer.node)
    const localGain = localContext.createGain()
    localGain.gain.value = streamMuted.value ? GAIN_MUTED : GAIN_UNMUTED
    source.connect(localGain)
    localGain.connect(localContext.destination)

    streamGain.value = localGain

    listenToStreamAnalyzer(localAnalyzer, eventParams)

    const handler = (): void => fail('audio_error')
    streamErrorHandler.value = handler
    localAudioEl.addEventListener('error', handler)

    await localAudioEl.play()
  } catch (error) {
    if (gen !== generation) return // invalidated during setup — bail quietly
    console.error('[BpmHeroTool] stream setup failed:', error)
    // play() runs after two awaits, and Safari can drop the click's user gesture
    // in between: that's a playback block, not a server problem, so skip the probe.
    const blocked = error instanceof DOMException && error.name === 'NotAllowedError'
    fail(error instanceof Error ? error.message : 'unknown', blocked ? 'autoplay' : undefined)
  }
}

function playStation(url: string) {
  invalidate()
  teardownStream()
  streamStatus.value = 'idle'
  streamUrl.value = url
  startStream()
}

// ─── Tab audio flow ──────────────────────────────────────────────────────
// For links we can't read (YouTube…): the user plays the track in another tab
// and shares that tab's audio. Desktop Chrome and Edge only (supportsTabAudio).

// Chrome's own hint, not yet in lib.dom: keep this tab out of the picker, since
// sharing the analyser's own (silent) tab is never what the user meant.
type TabCaptureOptions = NonNullable<Parameters<MediaDevices['getDisplayMedia']>[0]> & { selfBrowserSurface?: 'include' | 'exclude' }

const TAB_CAPTURE_MESSAGES: Record<Exclude<TabCaptureFailure, 'cancelled'>, string> = {
  no_audio: 'That share had no sound. Pick a Chrome tab and keep “Share tab audio” on.',
  unsupported: 'This browser can’t share tab audio. Play the track next to your mic instead.',
  error: 'Couldn’t start tab sharing. Try again, or play the track next to your mic.',
}

function failTabCapture(reason: TabCaptureFailure) {
  track('bpm_tab_capture_failed', { reason })
  // Cancelling the picker is a choice, not an error: leave the alternatives on screen.
  if (reason === 'cancelled') return
  streamError.value = TAB_CAPTURE_MESSAGES[reason]
  streamStatus.value = 'error'
}

async function startTabCapture() {
  if (streamStatus.value !== 'idle') return
  resetStreamReadings()
  const gen = ++generation

  let captured: MediaStream
  try {
    const options: TabCaptureOptions = {
      video: { displaySurface: 'browser' },
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      selfBrowserSurface: 'exclude',
    }
    captured = await navigator.mediaDevices.getDisplayMedia(options)
  } catch (error) {
    if (gen !== generation) return
    console.debug('[BpmHeroTool] tab capture refused:', error)
    return failTabCapture(classifyTabCaptureError(error))
  }

  // Only the sound is analysed: stop the video at once so Chrome stops capturing frames.
  captured.getVideoTracks().forEach(t => t.stop())
  const audioTrack = captured.getAudioTracks()[0]
  if (gen !== generation || !audioTrack) {
    captured.getTracks().forEach(t => t.stop())
    if (gen === generation) failTabCapture('no_audio')
    return
  }

  streamInput.value = 'tab'
  streamStatus.value = 'analysing'
  let localContext: AudioContext | null = null
  let localAnalyzer: BpmAnalyzer | null = null
  try {
    localContext = new AudioContext()
    await localContext.resume()
    localAnalyzer = await createRealtimeBpmAnalyzer(localContext, {
      continuousAnalysis: true,
      stabilizationTime: STREAM_STABILIZATION_MS,
    })
    if (gen !== generation) throw new Error('superseded')

    // Analysis only, never to the speakers: the shared tab already plays its own sound.
    localContext.createMediaStreamSource(captured).connect(localAnalyzer.node)
    streamTabCapture.value = captured
    streamContext.value = localContext
    streamAnalyzer.value = localAnalyzer
    listenToStreamAnalyzer(localAnalyzer, { input_method: 'tab' })
    audioTrack.addEventListener('ended', () => onTabSharingEnded(gen))
    track('bpm_tab_capture_started')
  } catch (error) {
    captured.getTracks().forEach(t => t.stop())
    disposeLocalStream(null, localContext, localAnalyzer, null)
    if (gen !== generation) return
    console.error('[BpmHeroTool] tab capture setup failed:', error)
    failTabCapture('error')
  }
}

// The user pressed the browser's "Stop sharing". Keep a stable reading on screen;
// without one there is nothing to show, so go back to the input.
function onTabSharingEnded(gen: number) {
  if (gen !== generation) return
  invalidate()
  teardownStream()
  if (streamStableBpm.value !== null) {
    tabSharingEnded.value = true
    return
  }
  streamStatus.value = 'idle'
  resetStreamReadings()
}

function useMicInstead() {
  setMode('mic')
  startMic('link_fallback')
}

function disposeLocalStream(
  audioEl: HTMLAudioElement | null,
  context: AudioContext | null,
  analyzer: BpmAnalyzer | null,
  gain: GainNode | null,
) {
  try { analyzer?.stop(); analyzer?.disconnect() } catch (e) { console.debug('[BpmHeroTool] stream dispose analyzer:', e) }
  try { gain?.disconnect() } catch (e) { console.debug('[BpmHeroTool] stream dispose gain:', e) }
  if (audioEl) {
    audioEl.pause()
    audioEl.removeAttribute('src')
    audioEl.load()
  }
  context?.close().catch((e) => console.debug('[BpmHeroTool] stream dispose context:', e))
}

function teardownStream() {
  try {
    streamAnalyzer.value?.stop()
    streamAnalyzer.value?.disconnect()
  } catch (e) {
    console.debug('[BpmHeroTool] teardownStream analyzer:', e)
  }
  streamAnalyzer.value = null
  try { streamGain.value?.disconnect() } catch (e) { console.debug('[BpmHeroTool] teardownStream gain:', e) }
  streamGain.value = null
  const audioEl = streamAudioEl.value
  if (audioEl) {
    // Drop our error listener *before* mutating src — clearing src fires the
    // audio element's `error` event, which we'd otherwise misread as a real failure.
    const handler = streamErrorHandler.value
    if (handler) {
      audioEl.removeEventListener('error', handler)
      streamErrorHandler.value = null
    }
    audioEl.pause()
    audioEl.removeAttribute('src')
    audioEl.load()
    streamAudioEl.value = null
  }
  streamTabCapture.value?.getTracks().forEach(t => t.stop())
  streamTabCapture.value = null
  streamContext.value?.close().catch((e) => console.debug('[BpmHeroTool] teardownStream context:', e))
  streamContext.value = null
}

function toggleStreamMute() {
  streamMuted.value = !streamMuted.value
  if (streamGain.value) {
    streamGain.value.gain.value = streamMuted.value ? GAIN_MUTED : GAIN_UNMUTED
  }
  track(streamMuted.value ? 'bpm_stream_muted' : 'bpm_stream_unmuted')
}

function stopStream() {
  track('bpm_stream_stopped')
  invalidate()
  teardownStream()
  streamStatus.value = 'idle'
  resetStreamReadings()
}

onMounted(() => {
  tabAudioSupported.value = supportsTabAudio(navigator as NavigatorLike)
})

// ─── Cleanup on unmount ──────────────────────────────────────────────────
onBeforeUnmount(() => {
  invalidate()
  teardownMic()
  teardownStream()
})

// ─── UI helpers ──────────────────────────────────────────────────────────
const dropZoneClasses = computed(() => ({
  'bpm-drop-zone-inner': true,
  'is-drag-over': isDragOver.value,
}))

const streamLiveLabel = computed(() => {
  if (streamInput.value === 'tab') return tabSharingEnded.value ? 'Sharing stopped' : 'Listening to tab'
  return streamMuted.value ? 'Analysing (muted)' : 'Playing'
})

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
</script>

<template>
  <div class="bpm-hero-tool">
    <div
      class="bpm-tabs"
      role="tablist"
      aria-label="Audio source"
    >
      <button
        v-for="m in modes"
        :key="m.id"
        type="button"
        role="tab"
        :aria-selected="mode === m.id"
        :class="['bpm-tab', { 'is-active': mode === m.id }]"
        @click="setMode(m.id)"
      >
        <component
          :is="iconForMode[m.id]"
          :size="16"
          :stroke-width="1.75"
          aria-hidden="true"
        />
        <span>{{ m.label }}</span>
      </button>
    </div>

    <div class="bpm-tool-body">
      <!-- FILE MODE -->
      <div
        v-if="mode === 'file'"
        class="bpm-mode bpm-mode-file"
      >
        <template v-if="fileStatus === 'idle'">
          <div
            :class="dropZoneClasses"
            role="button"
            tabindex="0"
            aria-label="Drop an audio file or click to browse"
            @click="openFilePicker"
            @keydown.enter.prevent="openFilePicker"
            @keydown.space.prevent="openFilePicker"
            @dragover="onDragOver"
            @dragleave="onDragLeave"
            @drop="onDrop"
          >
            <div
              class="bpm-icon"
              aria-hidden="true"
            >
              <FileAudio
                :size="52"
                :stroke-width="1.5"
              />
            </div>
            <div class="bpm-copy">
              <div class="bpm-headline">
                Drop audio file
              </div>
              <div class="bpm-sub">
                or click to browse
              </div>
            </div>
          </div>
          <input
            ref="fileInput"
            type="file"
            accept="audio/*,video/*"
            class="bpm-file-input"
            @change="onFileChange"
          />
          <div class="bpm-formats">
            MP3, WAV, FLAC, M4A, OGG &amp; more
          </div>
        </template>

        <template v-else-if="fileStatus === 'analysing'">
          <div
            class="bpm-state bpm-state-analysing"
            aria-live="polite"
          >
            <div
              class="bpm-spinner"
              aria-hidden="true"
            ></div>
            <div class="bpm-state-name">
              {{ fileName }}
            </div>
            <div class="bpm-state-label">
              Analysing&hellip;
            </div>
          </div>
        </template>

        <template v-else-if="fileStatus === 'result'">
          <div
            class="bpm-state bpm-state-result"
            aria-live="polite"
          >
            <div class="bpm-result-bpm">
              <span class="bpm-result-number">{{ fileBpm }}</span>
              <span class="bpm-result-unit">BPM</span>
            </div>
            <div class="bpm-state-name">
              {{ fileName }}
            </div>
            <div class="bpm-result-meta">
              <span v-if="fileDuration !== null">{{ formatDuration(fileDuration) }}</span>
              <span v-if="fileElapsedMs !== null">· Done in {{ fileElapsedMs }} ms</span>
            </div>
            <ResultToolLinks
              v-if="fileBpm !== null"
              :bpm="fileBpm"
              source="file"
            />
            <div class="bpm-result-actions">
              <button
                type="button"
                class="bpm-restart-btn"
                @click="restartFile"
              >
                Analyse another
              </button>
              <GithubStarSupport
                variant="inline"
                placement="demo-file-result"
              />
            </div>
          </div>
        </template>

        <template v-else>
          <div
            class="bpm-state bpm-state-error"
            role="alert"
          >
            <div class="bpm-state-name">
              {{ fileName }}
            </div>
            <div class="bpm-error-msg">
              {{ fileError }}
            </div>
            <button
              type="button"
              class="bpm-restart-btn"
              @click="restartFile"
            >
              Try another
            </button>
          </div>
        </template>
      </div>

      <!-- MIC MODE -->
      <div
        v-else-if="mode === 'mic'"
        class="bpm-mode bpm-mode-mic"
      >
        <template v-if="micStatus === 'idle'">
          <button
            type="button"
            class="bpm-mic-button"
            aria-label="Detect BPM from microphone"
            @click="startMic()"
          >
            <Mic
              :size="48"
              :stroke-width="1.5"
              aria-hidden="true"
            />
          </button>
          <div class="bpm-copy bpm-copy-centered">
            <div class="bpm-headline">
              Tap to detect BPM
            </div>
            <div class="bpm-sub">
              From your microphone
            </div>
          </div>
        </template>

        <template v-else-if="micStatus === 'analysing'">
          <div
            class="bpm-state bpm-state-analysing bpm-state-live"
            aria-live="polite"
          >
            <div
              class="bpm-live-indicator"
              aria-hidden="true"
            >
              <span class="bpm-live-dot"></span>
              Listening
            </div>
            <div class="bpm-result-bpm">
              <span class="bpm-result-number">{{ micLiveBpm ?? '—' }}</span>
              <span class="bpm-result-unit">BPM</span>
            </div>
            <div class="bpm-state-label">
              Stabilising…
            </div>
            <button
              type="button"
              class="bpm-restart-btn"
              @click="stopMic"
            >
              Stop
            </button>
          </div>
        </template>

        <template v-else-if="micStatus === 'result'">
          <div
            class="bpm-state bpm-state-result"
            aria-live="polite"
          >
            <div class="bpm-result-bpm">
              <span class="bpm-result-number">{{ micStableBpm }}</span>
              <span class="bpm-result-unit">BPM</span>
            </div>
            <div class="bpm-state-label">
              Stable from microphone
            </div>
            <ResultToolLinks
              v-if="micStableBpm !== null"
              :bpm="micStableBpm"
              source="mic"
            />
            <div class="bpm-result-actions">
              <button
                type="button"
                class="bpm-restart-btn"
                @click="stopMic"
              >
                Detect again
              </button>
              <GithubStarSupport
                variant="inline"
                placement="demo-mic-stable"
              />
            </div>
          </div>
        </template>

        <template v-else>
          <div
            class="bpm-state bpm-state-error"
            role="alert"
          >
            <div class="bpm-error-msg">
              {{ micError }}
            </div>
            <button
              type="button"
              class="bpm-restart-btn"
              @click="stopMic"
            >
              Try again
            </button>
          </div>
        </template>
      </div>

      <!-- STREAM MODE -->
      <div
        v-else
        class="bpm-mode bpm-mode-stream"
      >
        <template v-if="streamStatus === 'idle'">
          <label
            class="bpm-stream-label"
            for="bpm-stream-url"
          >Stream URL</label>
          <input
            id="bpm-stream-url"
            v-model="streamUrl"
            type="url"
            class="bpm-stream-input"
            placeholder="https://example.com/stream.mp3"
            spellcheck="false"
            autocomplete="off"
          />
          <!-- A platform link swaps the primary action for the alternative that
               works here: tab audio on desktop Chrome/Edge, the mic elsewhere. -->
          <template v-if="linkPlatform">
            <div
              class="bpm-link-note"
              role="status"
            >
              {{ linkPlatformLabel }} plays only inside its own player, so this page can’t read the link.
            </div>
            <template v-if="tabAudioSupported">
              <button
                type="button"
                class="bpm-stream-btn bpm-btn-with-icon bpm-btn-centered"
                @click="startTabCapture"
              >
                <MonitorUp
                  :size="16"
                  :stroke-width="1.75"
                  aria-hidden="true"
                />
                <span>Share this tab’s audio</span>
              </button>
              <div class="bpm-stream-hint">
                Open the link in another tab, press play, then pick that tab.
                Or <button
                  type="button"
                  class="bpm-text-btn"
                  @click="useMicInstead"
                >
                  play it next to your mic
                </button>.
              </div>
              <!-- Only here, where tab audio works: the extension needs a desktop
                   browser, and this is the moment its job is exactly what's wanted. -->
              <div
                v-if="STORE_URL && extensionCovers(linkPlatform)"
                class="bpm-stream-hint"
              >
                Skip the sharing next time. <a
                  class="bpm-text-btn"
                  :href="EXTENSION_PAGE"
                >Live BPM Detector</a> for Chrome shows the tempo on the page.
              </div>
            </template>
            <template v-else>
              <button
                type="button"
                class="bpm-stream-btn bpm-btn-with-icon bpm-btn-centered"
                @click="useMicInstead"
              >
                <Mic
                  :size="16"
                  :stroke-width="1.75"
                  aria-hidden="true"
                />
                <span>Play it next to your mic</span>
              </button>
              <div class="bpm-stream-hint">
                Play the track out loud on any device and hold it near this one.
              </div>
            </template>
          </template>
          <template v-else>
            <button
              type="button"
              class="bpm-stream-btn"
              @click="startStream"
            >
              Analyse stream
            </button>
            <div class="bpm-stream-hint">
              Or try a station:
              <template
                v-for="(station, index) in STATIONS"
                :key="station.url"
              >
                <button
                  type="button"
                  class="bpm-text-btn"
                  @click="playStation(station.url)"
                >
                  {{ station.name }}
                </button><span v-if="index < STATIONS.length - 1"> · </span>
              </template>
            </div>
          </template>
        </template>

        <template v-else-if="streamStatus === 'analysing'">
          <div
            class="bpm-state bpm-state-analysing bpm-state-live"
            aria-live="polite"
          >
            <div
              class="bpm-live-indicator"
              aria-hidden="true"
            >
              <span
                v-if="!tabSharingEnded"
                class="bpm-live-dot"
              ></span>
              {{ streamLiveLabel }}
            </div>
            <div class="bpm-result-bpm">
              <span class="bpm-result-number">{{ streamLiveBpm ?? '—' }}</span>
              <span class="bpm-result-unit">BPM</span>
            </div>
            <div
              v-if="streamStableBpm !== null"
              class="bpm-stable-pill"
              aria-live="polite"
            >
              <span
                class="bpm-stable-dot"
                aria-hidden="true"
              ></span>
              Stable at {{ streamStableBpm }} BPM
            </div>
            <div class="bpm-stream-actions">
              <button
                v-if="streamInput === 'url'"
                type="button"
                class="bpm-restart-btn bpm-btn-with-icon"
                :aria-pressed="streamMuted"
                @click="toggleStreamMute"
              >
                <component
                  :is="streamMuted ? VolumeX : Volume2"
                  :size="14"
                  :stroke-width="1.75"
                  aria-hidden="true"
                />
                <span>{{ streamMuted ? 'Unmute' : 'Mute' }}</span>
              </button>
              <button
                type="button"
                class="bpm-restart-btn"
                @click="stopStream"
              >
                Stop
              </button>
            </div>
            <!-- Star CTA gated on stability — appears at the success moment
                 (analyser stabilised) and shares the same v-if as the stable
                 pill above. Sits in its own row below the controls toolbar to
                 keep action vs. promo affordances visually separate. -->
            <div
              v-if="streamStableBpm !== null"
              class="bpm-result-actions"
            >
              <GithubStarSupport
                variant="inline"
                placement="demo-stream-stable"
              />
            </div>
            <ResultToolLinks
              v-if="streamStableBpm !== null"
              :bpm="streamStableBpm"
              source="stream"
            />
          </div>
        </template>

        <template v-else>
          <div
            class="bpm-state bpm-state-error"
            role="alert"
          >
            <div class="bpm-error-msg">
              {{ streamError }}
            </div>
            <button
              type="button"
              class="bpm-restart-btn"
              @click="stopStream"
            >
              Try again
            </button>
            <div
              v-if="streamInput === 'url'"
              class="bpm-stream-hint"
            >
              Stations that work here:
              <template
                v-for="(station, index) in STATIONS"
                :key="station.url"
              >
                <button
                  type="button"
                  class="bpm-text-btn"
                  @click="playStation(station.url)"
                >
                  {{ station.name }}
                </button><span v-if="index < STATIONS.length - 1"> · </span>
              </template>
            </div>
          </div>
        </template>
      </div>
    </div>

    <div class="bpm-badge">
      <ShieldCheck
        :size="12"
        :stroke-width="2"
        aria-hidden="true"
      />
      Audio stays in your browser
    </div>
  </div>
</template>

<style scoped>
.bpm-hero-tool {
  width: 100%;
  max-width: 440px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.75rem;
  position: relative;
  z-index: 2;
}

.bpm-tabs {
  display: flex;
  gap: 0.25rem;
  padding: 0.25rem;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  width: 100%;
}

.bpm-tab {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--vp-c-text-2);
  background: transparent;
  border: none;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.bpm-tab:hover:not(.is-active) { color: var(--vp-c-text-1); }
.bpm-tab.is-active {
  background: var(--vp-c-bg);
  color: var(--vp-c-brand-1);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.bpm-tab > :deep(svg) { flex-shrink: 0; }

.bpm-tool-body {
  display: flex;
  align-items: center;
  justify-content: center;
}

.bpm-mode {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.bpm-mode-file { gap: 0.5rem; }

.bpm-drop-zone-inner {
  width: 100%;
  padding: 1.75rem 1.25rem;
  border: 2px dashed var(--vp-c-divider);
  border-radius: 16px;
  background: var(--vp-c-bg-soft);
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, transform 0.15s ease;
  outline: none;
}

.bpm-drop-zone-inner:hover,
.bpm-drop-zone-inner:focus-visible {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-bg-alt);
}

.bpm-drop-zone-inner.is-drag-over {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-bg-alt);
  transform: scale(1.01);
}

.bpm-icon {
  color: var(--vp-c-brand-1);
  margin-bottom: 0.5rem;
  display: flex;
  justify-content: center;
  /* Subtle downward float — signals "you can drop something here" without
     grabbing attention. 3s cycle, 4px travel. Pauses on hover / drag-over. */
  animation: bpm-icon-float 3s ease-in-out infinite;
}

.bpm-drop-zone-inner:hover .bpm-icon,
.bpm-drop-zone-inner:focus-visible .bpm-icon,
.bpm-drop-zone-inner.is-drag-over .bpm-icon {
  animation-play-state: paused;
}

@keyframes bpm-icon-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(4px); }
}

.bpm-headline {
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
  letter-spacing: -0.01em;
}

.bpm-sub {
  font-size: 0.9rem;
  color: var(--vp-c-text-2);
  margin-top: 0.2rem;
}

.bpm-copy-centered { text-align: center; }

.bpm-file-input { display: none; }

.bpm-formats {
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
  text-align: center;
}

/* Shared state card */
.bpm-state {
  width: 100%;
  padding: 1.25rem 1rem;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
}

.bpm-state-name {
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
  word-break: break-all;
  max-width: 100%;
}

.bpm-state-label {
  font-size: 0.9rem;
  color: var(--vp-c-text-2);
}

/* Live indicator */
.bpm-live-indicator {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--vp-c-danger-1, #f43f5e);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.bpm-live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--vp-c-danger-1, #f43f5e);
  box-shadow: 0 0 0 0 rgba(244, 63, 94, 0.45);
  animation: bpm-pulse 1.2s ease-out infinite;
}

@keyframes bpm-pulse {
  0% { box-shadow: 0 0 0 0 rgba(244, 63, 94, 0.45); }
  70% { box-shadow: 0 0 0 8px rgba(244, 63, 94, 0); }
  100% { box-shadow: 0 0 0 0 rgba(244, 63, 94, 0); }
}

/* Spinner */
.bpm-spinner {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 3px solid var(--vp-c-divider);
  border-top-color: var(--vp-c-brand-1);
  animation: bpm-spin 0.8s linear infinite;
}

@keyframes bpm-spin { to { transform: rotate(360deg); } }

/* Result */
.bpm-result-bpm {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.5rem;
  line-height: 1;
}

.bpm-result-number {
  font-size: 4rem;
  font-weight: 700;
  color: var(--vp-c-brand-1);
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
  min-width: 3.2ch;
}

.bpm-result-unit {
  font-size: 1rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
  letter-spacing: 0.05em;
}

.bpm-result-meta {
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
  display: flex;
  gap: 0.4rem;
  justify-content: center;
}

.bpm-restart-btn {
  margin-top: 0.4rem;
  padding: 0.5rem 1rem;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease;
}

.bpm-restart-btn:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

/* Action row pairing the primary restart/stop button with the inline
   GithubStarSupport CTA in success states (file-result, mic-stable, and
   stream stability). The row owns the top margin so the restart button drops
   its own (avoids double-stacking when nested here). */
.bpm-result-actions {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 0.4rem;
}

.bpm-result-actions .bpm-restart-btn {
  margin-top: 0;
}

.bpm-stream-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  flex-wrap: wrap;
}

/* Stable pill shown inside stream analysing panel — signals the analyser has
   stabilised while the stream continues playing (continuousAnalysis=true). */
.bpm-stable-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.7rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--vp-c-green-1, #10b981);
  background: color-mix(in srgb, var(--vp-c-green-1, #10b981) 12%, transparent);
  border-radius: 999px;
  letter-spacing: 0.02em;
}

.bpm-stable-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

.bpm-state-error { border-color: var(--vp-c-danger-1, #f43f5e); }
.bpm-error-msg {
  font-size: 0.9rem;
  color: var(--vp-c-danger-1, #f43f5e);
}

/* Mic */
.bpm-mic-button {
  width: 148px;
  height: 148px;
  border-radius: 50%;
  border: none;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-brand-1);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 24px rgba(100, 108, 255, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  transition: transform 0.15s ease, box-shadow 0.2s ease, background 0.2s ease;
  margin-top: 0.5rem;
}

.bpm-mic-button:hover {
  transform: scale(1.03);
  box-shadow: 0 12px 32px rgba(100, 108, 255, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  background: var(--vp-c-bg-alt);
}

.bpm-mic-button:active { transform: scale(0.98); }

/* Stream */
.bpm-mode-stream {
  gap: 0.6rem;
  padding: 0.25rem 0.25rem 0;
  width: 100%;
}

.bpm-stream-label {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--vp-c-text-2);
  align-self: flex-start;
}

.bpm-stream-input {
  width: 100%;
  padding: 0.7rem 0.9rem;
  font-size: 0.9rem;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  outline: none;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.bpm-stream-input:focus {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-bg);
}

.bpm-stream-btn {
  width: 100%;
  padding: 0.65rem 1rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--vp-c-bg);
  background: var(--vp-c-brand-1);
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.1s ease;
}

.bpm-stream-btn:hover { background: var(--vp-c-brand-2); }
.bpm-stream-btn:active { transform: translateY(1px); }

.bpm-stream-hint {
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
  text-align: center;
  width: 100%;
}

.bpm-stream-hint a {
  color: var(--vp-c-text-2);
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* Why a platform link can't be read: one plain line, not an error (nothing failed). */
.bpm-link-note {
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
  text-align: center;
  width: 100%;
}

/* Inline actions inside hint text (stations, mic fallback): styled as the hint's
   links so the one filled button stays the only primary action. */
.bpm-text-btn {
  padding: 0;
  font: inherit;
  color: var(--vp-c-text-2);
  background: none;
  border: none;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.bpm-text-btn:hover { color: var(--vp-c-brand-1); }

.bpm-btn-centered { justify-content: center; }

.bpm-badge {
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  align-self: center;
  margin-top: 0.25rem;
}

.bpm-badge > :deep(svg) {
  color: var(--vp-c-green-1, #10b981);
  flex-shrink: 0;
}

.bpm-btn-with-icon {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.bpm-btn-with-icon > :deep(svg) { flex-shrink: 0; }

@media (max-width: 640px) {
  .bpm-drop-zone-inner { padding: 1.25rem 1rem; }
  .bpm-headline { font-size: 1.05rem; }
  .bpm-mic-button { width: 128px; height: 128px; }
  .bpm-result-number { font-size: 3.25rem; }
}

@media (prefers-reduced-motion: reduce) {
  .bpm-spinner { animation: none; }
  .bpm-live-dot { animation: none; }
  .bpm-icon { animation: none; }
  .bpm-drop-zone-inner.is-drag-over { transform: none; }
  .bpm-mic-button:hover { transform: none; }
}
</style>
