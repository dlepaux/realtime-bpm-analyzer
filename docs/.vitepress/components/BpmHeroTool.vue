<script setup lang="ts">
import { ref, shallowRef, computed, onBeforeUnmount } from 'vue'
import {
  FileAudio,
  Mic,
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

// Strip query + hash from a URL before sending it to analytics — prevents
// leakage of signed tokens, session IDs, or any other query-encoded secrets.
function sanitiseUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl)
    return parsed.origin + parsed.pathname
  } catch {
    return ''
  }
}

// ─── Mode switching (with teardown) ──────────────────────────────────────
function setMode(next: Mode) {
  if (mode.value === next) return
  invalidate()
  if (mode.value === 'mic') teardownMic()
  if (mode.value === 'stream') teardownStream()
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

async function analyseFile(file: File, source: 'drop' | 'browse') {
  fileName.value = file.name
  fileStatus.value = 'analysing'
  fileError.value = null
  fileBpm.value = null
  fileDuration.value = null
  fileElapsedMs.value = null

  track('bpm_file_selected', {
    source,
    size_kb: Math.round(file.size / 1024),
    extension: file.name.split('.').pop()?.toLowerCase() ?? '',
  })

  const started = performance.now()

  try {
    const arrayBuffer = await file.arrayBuffer()
    const audioContext = new AudioContext()
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    const candidates = await analyzeFullBuffer(audioBuffer)
    audioContext.close().catch((e) => console.debug('[BpmHeroTool] file context close:', e))

    const top = candidates?.[0]?.tempo
    if (top === undefined) throw new Error('No BPM candidate returned')

    fileBpm.value = Math.round(top)
    fileDuration.value = audioBuffer.duration
    fileElapsedMs.value = Math.round(performance.now() - started)
    fileStatus.value = 'result'

    track('bpm_file_result', {
      source,
      bpm: fileBpm.value,
      duration_s: Math.round(fileDuration.value),
      elapsed_ms: fileElapsedMs.value,
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown'
    fileError.value = 'Couldn’t read that file. Try MP3, WAV, or FLAC.'
    fileStatus.value = 'error'
    track('bpm_file_error', { source, reason })
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
async function startMic() {
  if (micStatus.value !== 'idle') return

  track('bpm_mic_clicked')

  micError.value = null
  micLiveBpm.value = null
  micStableBpm.value = null
  micStatus.value = 'analysing'

  // Capture the generation at entry. If anything invalidates it mid-setup
  // (mode switch, stop, unmount), bail and tear down the locals we've built
  // so far — they were never committed to component state.
  const gen = ++generation

  try {
    const localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    if (gen !== generation) return disposeLocalMic(localStream, null, null)

    const localContext = new AudioContext()
    await localContext.resume()
    if (gen !== generation) return disposeLocalMic(localStream, localContext, null)

    const localAnalyzer = await createRealtimeBpmAnalyzer(localContext)
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
      micStableBpm.value = Math.round(top)
      track('bpm_mic_stable', { bpm: micStableBpm.value })
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
    // Nothing was committed to component state, and locals are out of scope
    // here; teardownMic() is a no-op safety net for anything that did land.
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
async function startStream() {
  if (streamStatus.value !== 'idle') return
  const url = streamUrl.value.trim()
  if (!url) return

  const sanitised = sanitiseUrl(url)
  track('bpm_stream_clicked', { url: sanitised })

  streamError.value = null
  streamLiveBpm.value = null
  streamStableBpm.value = null
  streamStatus.value = 'analysing'

  const gen = ++generation

  try {
    const localAudioEl = new Audio()
    localAudioEl.crossOrigin = 'anonymous'
    localAudioEl.src = url
    localAudioEl.preload = 'auto'

    const localContext = new AudioContext()
    await localContext.resume()
    if (gen !== generation) return disposeLocalStream(localAudioEl, localContext, null, null)

    const localAnalyzer = await createRealtimeBpmAnalyzer(localContext, {
      continuousAnalysis: true,
      stabilizationTime: STREAM_STABILIZATION_MS,
    })
    if (gen !== generation) return disposeLocalStream(localAudioEl, localContext, localAnalyzer, null)

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

    // Commit to component state.
    streamAudioEl.value = localAudioEl
    streamContext.value = localContext
    streamAnalyzer.value = localAnalyzer
    streamGain.value = localGain

    localAnalyzer.on('bpm', (data: BpmCandidates) => {
      const top = data.bpm?.[0]?.tempo
      if (top === undefined) return
      streamLiveBpm.value = Math.round(top)
    })

    localAnalyzer.on('bpmStable', (data: BpmCandidates) => {
      const top = data.bpm?.[0]?.tempo
      if (top === undefined) return
      streamStableBpm.value = Math.round(top)
      track('bpm_stream_stable', { bpm: streamStableBpm.value, url: sanitised })
    })

    const handler = (): void => {
      streamError.value = 'Stream failed to load. URL may be unreachable or blocked by CORS.'
      streamStatus.value = 'error'
      track('bpm_stream_error', { url: sanitised, reason: 'audio_error' })
      teardownStream()
    }
    streamErrorHandler.value = handler
    localAudioEl.addEventListener('error', handler)

    await localAudioEl.play()
  } catch (error) {
    if (gen !== generation) return // invalidated during setup — bail quietly
    const reason = error instanceof Error ? error.message : 'unknown'
    streamError.value = 'Couldn’t play that stream. CORS or network may be blocking it.'
    streamStatus.value = 'error'
    track('bpm_stream_error', { url: sanitised, reason })
    console.error('[BpmHeroTool] stream setup failed:', error)
    teardownStream()
  }
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
  streamLiveBpm.value = null
  streamStableBpm.value = null
  streamError.value = null
}

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
            Handles FLAC, WAV &amp; MP3
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
            <button
              type="button"
              class="bpm-restart-btn"
              @click="restartFile"
            >
              Analyse another
            </button>
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
            @click="startMic"
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
            <button
              type="button"
              class="bpm-restart-btn"
              @click="stopMic"
            >
              Detect again
            </button>
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
          <button
            type="button"
            class="bpm-stream-btn"
            @click="startStream"
          >
            Analyse stream
          </button>
          <div class="bpm-stream-hint">
            Example from <a
              href="https://somafm.com/defcon/"
              target="_blank"
              rel="noopener"
            >SomaFM DEF CON Radio</a>
          </div>
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
              <span class="bpm-live-dot"></span>
              {{ streamMuted ? 'Analysing (muted)' : 'Playing' }}
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
