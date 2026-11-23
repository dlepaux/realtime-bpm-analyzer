<script setup lang="ts">
import { ref, shallowRef, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import {
  FileAudio,
  Mic,
  MonitorUp,
  Radio,
  Volume2,
  VolumeX,
} from 'lucide-vue-next'
import {
  analyzeFullBuffer,
  createRealtimeBpmAnalyzer,
  type BpmAnalyzer,
} from 'realtime-bpm-analyzer'
import { useAnalytics } from '../composables/useAnalytics'
import { useMicGuard } from '../composables/useMicGuard'
import { MIC_LISTENING_LINE, MIC_STOPPED_LINE, micStatusLine, type MicPhase } from '../tools/mic-guard'
import { fileExtensionParam } from '../tools/analytics-params'
import { classifyMicError } from '../tools/mic-error'
import { MIC_ALLOW_STEPS, MIC_BLOCKED_LINE, MIC_PURPOSE_LINE, PHONE_LINK_LINE, isPhone, micHelpBrowser, watchMicPermission, type MicPermission, type PermissionsLike } from '../tools/mic-denied-help'
import { toolPageOf, watchToolSeen } from '../tools/tool-seen'
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
import ExtensionResultPrompt from './ExtensionResultPrompt.vue'
import BeatMarkerExport from './BeatMarkerExport.vue'
import BpmReadout from './BpmReadout.vue'
import BpmSourceSwitch from './BpmSourceSwitch.vue'
import BpmCrate from './BpmCrate.vue'
import { CRATE_STORAGE_KEY, addToCrate, crateRowBucket, parseCrate, removeFromCrate, serializeCrate, type CrateRow } from '../tools/bpm-crate'
import { browserStore, readItem, writeItem } from '../tools/local-store'
import { batchProgressLabel, listsFailures, planBatch } from '../tools/file-batch'
import { STORE_URL } from '../tools/extension-live'
import { EXTENSION_PAGE, extensionCovers } from '../tools/extension-promo'

type Mode = 'file' | 'mic' | 'stream'
type Status = 'idle' | 'analysing' | 'result' | 'error'

// Magic numbers — named for grep-ability.
const STREAM_RESTART_SECONDS = 20
const GAIN_UNMUTED = 1
const GAIN_MUTED = 0

// `video` frames the file panel for a video (the /video-bpm page): same analysis,
// since the browser decodes a video's sound track like any audio file.
const props = withDefaults(defineProps<{ variant?: 'audio' | 'video' }>(), { variant: 'audio' })
// A touch screen has nothing to drop, so it gets the short line; CSS picks it with
// (pointer: coarse), so the server's HTML and the hydrated page agree.
const FILE_COPY = {
  audio: {
    headline: 'Drop a song or choose a file',
    touchHeadline: 'Choose a song',
    formats: 'MP3, WAV, FLAC, M4A, OGG',
    decodeError: 'Your browser couldn’t decode that file. Try MP3, WAV, FLAC, M4A or OGG.',
  },
  video: {
    headline: 'Drop a video or choose a file',
    touchHeadline: 'Choose a video',
    formats: 'MP4, WebM, MOV and audio files',
    decodeError: 'Your browser couldn’t decode the sound of that file. Try MP4 or WebM, or export the audio as WAV.',
  },
} as const
const STAYS_ON_DEVICE = 'Audio stays on your device'
const fileCopy = computed(() => FILE_COPY[props.variant])

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
// For the beat marker export: the reading's unrounded bpmExact, which seeds the
// export's tempo fit, since a grid on the whole fileBpm drifts on long tracks, and the
// first channel, the one analyzeFullBuffer reads. The export measures the first beat and refines
// the tempo in it only if it is opened, and the channel is released once that has run, or when
// the result is cleared. An unopened result keeps it until then.
const fileTempo = ref<number | null>(null)
const fileSamples = shallowRef<Float32Array | null>(null)
const fileSampleRate = ref<number | null>(null)

// ─── Mic ─────────────────────────────────────────────────────────────────
const micStatus = ref<Status>('idle')
const micLiveBpm = ref<number | null>(null)
const micStableBpm = ref<number | null>(null)
const micError = ref<string | null>(null)
// A blocked mic gets its own panel: how to allow it again in this browser, and the two inputs
// that need no mic. Read from the user agent once mounted, never sent.
const micDenied = ref(false)
const micAllowSteps = ref(MIC_ALLOW_STEPS.other)
// A site blocked earlier is refused at once, with no prompt: the Mic tab shows the help in place
// of a button that could only fail. `unknown` where the browser can't tell, until a refusal.
const micPermission = ref<MicPermission>('unknown')
const micBlocked = computed(() => micDenied.value || (micStatus.value === 'idle' && micPermission.value === 'denied'))
let stopPermissionWatch: (() => void) | null = null
// `shallowRef` for audio graph nodes — Vue shouldn't deep-track them (they're
// not reactive targets) and we want consistent `.value = null` semantics.
const micContext = shallowRef<AudioContext | null>(null)
const micStream = shallowRef<MediaStream | null>(null)
const micAnalyzer = shallowRef<BpmAnalyzer | null>(null)
// When this session's mic was clicked, for the elapsed time bpm_mic_stopped reports. Null once
// the session is reported, so it is reported once, however it ends.
let micStartedAt: number | null = null
const micGuard = useMicGuard()
const { paused: micPaused, tooQuiet: micTooQuiet, offerTap: micOfferTap } = micGuard
// A mic result can outlive its session (kept on screen after a tab switch): it then says so,
// and its button starts over instead of claiming to stop something. An explicit flag, set where
// the result is kept, because "no audio context" also holds while the mic is still starting.
const micResultKept = ref(false)
const micLive = computed(() => !micResultKept.value)
const micLine = computed(() => (micLive.value
  ? micStatusLine({ paused: micPaused.value, tooQuiet: micTooQuiet.value })
  : MIC_STOPPED_LINE))
const toolRoot = ref<HTMLElement | null>(null)
// The input area under the source switch: the drop zone, the mic or the stream, whichever shows.
const toolBody = ref<HTMLElement | null>(null)
let stopSeenWatch = () => {}
const micStopButton = ref<HTMLButtonElement | null>(null)

// ─── Stream ──────────────────────────────────────────────────────────────
// Prefilled from the presets, so the default is always a station whose terms were read.
const streamUrl = ref(STATIONS[0]?.url ?? '')
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
// tab's audio shared through getDisplayMedia.
const streamInput = ref<'url' | 'tab'>('url')
const streamTabCapture = shallowRef<MediaStream | null>(null)
// The user pressed Chrome's "Stop sharing" after a stable reading: keep the BPM on screen.
const tabSharingEnded = ref(false)
// Decided on mount, not during SSR, because it reads `navigator`.
const tabAudioSupported = ref(false)
// A phone has no tab to share, so a pasted link can only reach the mic.
const onPhone = ref(false)

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

const modes = [
  { id: 'file', label: 'File', icon: FileAudio },
  { id: 'mic', label: 'Mic', icon: Mic },
  { id: 'stream', label: 'Stream', icon: Radio },
] as const satisfies readonly { id: Mode; label: string; icon: unknown }[]

// ─── Mode switching (with teardown) ──────────────────────────────────────
function setMode(next: Mode) {
  if (mode.value === next) return
  invalidate()
  // Leaving a mode stops its audio, so only a finished mic result may stay on
  // screen. A live panel or a pending "Checking why…" would show nothing running.
  if (mode.value === 'mic') {
    reportMicStop()
    teardownMic()
    if (micStatus.value === 'result') micResultKept.value = true
    else {
      micStatus.value = 'idle'
      micLiveBpm.value = null
      micError.value = null
      micDenied.value = false
    }
  }
  if (mode.value === 'stream') {
    teardownStream()
    streamStatus.value = 'idle'
    resetStreamReadings()
  }
  announce('')
  mode.value = next
  track('bpm_tab_change', { mode: next })
}

// ─── File flow ───────────────────────────────────────────────────────────
function openFilePicker() {
  fileInput.value?.click()
}

// "Your tracks": every file result of the audio tool, kept in this browser. The video
// page's result is a marker export, not a track list, so it keeps nothing.
const keepsTracks = computed(() => props.variant === 'audio')
const crateRows = shallowRef<CrateRow[]>([])
// False once this browser refused to keep the list (blocked storage, quota): the list then says
// it lasts for this visit only, and every change works on the copy in memory.
const crateStored = ref(true)
const batchProgress = ref<string | null>(null)
const batchFailures = shallowRef<string[]>([])
const batchSkipped = ref(0)
let batchRunning = false
const chooseFileButton = ref<HTMLButtonElement | null>(null)

// Read, change, write: another tab, or this page's previous instance finishing a file after a
// navigation, may have written since this one read the list, and writing this instance's copy
// over theirs would drop their tracks without a word.
function updateCrate(change: (rows: readonly CrateRow[]) => CrateRow[]) {
  const store = browserStore()
  const current = store && crateStored.value ? parseCrate(readItem(store, CRATE_STORAGE_KEY)) : crateRows.value
  const next = change(current)
  crateRows.value = next
  crateStored.value = writeItem(store, CRATE_STORAGE_KEY, serializeCrate(next))
}

// Another tab added, removed or cleared tracks: show its list. A null key is a clear of all storage.
// Not while this tab can't write: its list then lives only in memory, and taking the other tab's
// would drop it.
function onCrateStorage(event: StorageEvent) {
  if (event.storageArea !== browserStore() || !crateStored.value) return
  if (event.key === CRATE_STORAGE_KEY || event.key === null) crateRows.value = parseCrate(event.newValue)
}

function clearBatchReport() {
  batchFailures.value = []
  batchSkipped.value = 0
}

// One file after another, never in parallel: each decode holds a whole track in memory. The drop
// zone and the picker exist only while the tool is idle, so a batch never overlaps another.
// Leaving file mode or the page invalidates the batch: the file being read finishes, as a lone file
// always did, and the rest are counted as left out rather than decoded behind the mic.
async function analyseFiles(files: readonly File[], inputMethod: 'drop' | 'browse') {
  if (files.length === 0 || batchRunning) return
  const { take, skipped } = planBatch(files)
  clearBatchReport()
  batchSkipped.value = skipped
  batchRunning = true
  const gen = generation
  let readCount = 0
  try {
    for (const [index, file] of take.entries()) {
      if (gen !== generation) {
        batchSkipped.value += take.length - index
        break
      }
      batchProgress.value = batchProgressLabel(index, take.length)
      const read = await analyseFile(file, inputMethod)
      if (read) readCount++
      else if (listsFailures(take.length)) batchFailures.value = [...batchFailures.value, file.name]
    }
  } finally {
    batchRunning = false
    batchProgress.value = null
  }
  // One line for the whole batch, once it ends: the list's own text appears with it, too late
  // for a screen reader to notice.
  if (listsFailures(take.length) && gen === generation) {
    // Emptied first, so a second batch with the same count is read out too.
    announce('')
    void nextTick(() => announce(`${readCount} of ${take.length} files read`))
  }
}

// Clearing the list or dismissing the report can remove the element that had focus: hand it to
// the list if it is still there, else to the way in to the tool.
function focusAfterCrateChange() {
  void nextTick(() => {
    const target = document.getElementById('your-tracks') ?? chooseFileButton.value ?? toolRoot.value?.querySelector('button')
    target?.focus()
  })
}

// The list's own focus move covers a row that leaves others behind; the last row unmounts the
// list with it, so the parent hands focus on.
function removeFromList(key: string) {
  updateCrate(rows => removeFromCrate(rows, key))
  if (crateRows.value.length === 0) focusAfterCrateChange()
}

function clearCrate() {
  updateCrate(() => [])
  focusAfterCrateChange()
}

function dismissBatchReport() {
  clearBatchReport()
  focusAfterCrateChange()
}

function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  void analyseFiles(Array.from(target.files ?? []), 'browse')
  target.value = ''
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  isDragOver.value = false
  // A lone file on the video page, as before; the audio tool takes a batch.
  const files = Array.from(event.dataTransfer?.files ?? [])
  void analyseFiles(keepsTracks.value ? files : files.slice(0, 1), 'drop')
}

function jumpToCrate() {
  const list = document.getElementById('your-tracks')
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  list?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' })
  list?.focus({ preventScroll: true })
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
  isDragOver.value = true
}

function onDragLeave() {
  isDragOver.value = false
}

// `input_method`, not `source`: GA4 reads an event parameter named `source` as the
// session's traffic source, which credited 1,237 sessions to "drop"/"browse".
/** Analyses one file into the tool's result, and answers whether it gave a reading. */
async function analyseFile(file: File, inputMethod: 'drop' | 'browse'): Promise<boolean> {
  fileName.value = file.name
  fileStatus.value = 'analysing'
  fileError.value = null
  fileBpm.value = null
  fileTempo.value = null
  fileSamples.value = null
  fileSampleRate.value = null
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
    const reading = await analyzeFullBuffer(audioBuffer)

    if (reading === null) throw new Error('No BPM candidate returned')

    fileBpm.value = reading.bpm
    fileTempo.value = reading.bpmExact
    fileDuration.value = audioBuffer.duration
    fileElapsedMs.value = Math.round(performance.now() - started)
    fileStatus.value = 'result'

    track('bpm_file_result', {
      input_method: inputMethod,
      bpm: fileBpm.value,
      // Which engine read it: the v6 default moved to the tempogram, and the series splits on this
      engine: reading.engine,
      duration_s: Math.round(fileDuration.value),
      elapsed_ms: fileElapsedMs.value,
    })
    fileSamples.value = audioBuffer.getChannelData(0)
    fileSampleRate.value = audioBuffer.sampleRate
    if (keepsTracks.value) {
      updateCrate(rows => addToCrate(rows, {
        name: file.name,
        sizeBytes: file.size,
        bpm: reading.bpm,
        durationS: audioBuffer.duration,
        addedAt: Date.now(),
      }))
    }
    return true
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown'
    fileError.value = stage === 'decode'
      ? fileCopy.value.decodeError
      : 'No clear beat found in that file. Try a section with drums or bass.'
    fileStatus.value = 'error'
    track('bpm_file_error', {
      input_method: inputMethod,
      error_kind: stage === 'decode' ? 'decode_failed' : 'no_bpm',
      extension,
      reason,
    })
    console.error('[BpmHeroTool] file analysis failed:', error)
    return false
  }
}

function restartFile() {
  track('bpm_file_restart')
  fileTempo.value = null
  fileSamples.value = null
  fileSampleRate.value = null
  fileStatus.value = 'idle'
  fileName.value = null
  fileBpm.value = null
  fileDuration.value = null
  fileElapsedMs.value = null
  fileError.value = null
}

// ─── Mic flow ────────────────────────────────────────────────────────────
async function startMic(entry: 'mic_tab' | 'link_fallback' | 'mic_resume' = 'mic_tab') {
  // A blocked site is refused with no prompt: the Mic panel shows how to allow it instead.
  if (micStatus.value !== 'idle' || micPermission.value === 'denied') return

  track('bpm_mic_clicked', { input_method: entry })
  const clickedAt = performance.now()

  micError.value = null
  micDenied.value = false
  micLiveBpm.value = null
  micStableBpm.value = null
  micResultKept.value = false
  micStatus.value = 'analysing'
  micStartedAt = clickedAt
  micGuard.resetReport()

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
    source.connect(localAnalyzer.input)
    // Intentionally do NOT connect to destination — avoids mic feedback.
    micGuard.attach(localContext, localStream, source, clickedAt)

    // The state is current inside a reading listener. A lock can move without a
    // statechange (peaks relocks on a fuller rung), so the locked BPM follows every reading.
    localAnalyzer.on('reading', reading => {
      micLiveBpm.value = Math.round(reading.bpm)
      if (localAnalyzer.state.status === 'locked') micStableBpm.value = micLiveBpm.value
    })

    localAnalyzer.on('statechange', ({ to, reason }) => {
      // Stopped by the caller is the session ending (Stop, a tab switch), never a lock lost: a tab
      // switch keeps the locked result on screen, so it must not be demoted on the way out. Stopped
      // by a fault is a dead analyzer: say so and release the mic, rather than keep it listening.
      if (to.status === 'stopped') {
        if (reason === 'failed' && micAnalyzer.value === localAnalyzer) failMic()
        return
      }
      if (to.status !== 'locked') {
        // A lock that no longer holds (a new song, the beat or the sound lost) goes back to
        // Settling, never a stale Stable. With no reading at all, no number either.
        if (to.status === 'listening') micLiveBpm.value = null
        if (micStatus.value === 'result') micStatus.value = 'analysing'
        return
      }
      micGuard.markLocked()
      const bpm = Math.round(to.reading.bpm)
      // The analyzer can lock again after it unlocks or loses the pulse: report a tempo only
      // when it differs from the locked tempo last shown, which readings keep current while locked,
      // so a relock on the same tempo sends nothing. The first one also says how long it took.
      if (bpm !== micStableBpm.value) {
        track('bpm_mic_locked', { ...stableReading(bpm, micStableBpm.value === null, clickedAt), engine: to.reading.engine })
      }
      micStableBpm.value = bpm
      micStatus.value = 'result'
    })
  } catch (error) {
    if (gen !== generation) return // invalidated during setup — bail quietly
    const reason = error instanceof Error ? error.message : 'unknown'
    const micFailure = classifyMicError(error)
    micDenied.value = micFailure.error_kind === 'denied'
    micError.value = micDenied.value
      ? MIC_BLOCKED_LINE
      : 'Couldn’t start the microphone. Check your device and try again.'
    micStatus.value = 'error'
    track('bpm_mic_error', { reason, ...micFailure })
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
  micGuard.detach()
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

// Where the session stood when it stopped, so the half of mobile sessions that never lock
// say why: still listening, settling, paused by an interruption, or failed.
function micPhase(): MicPhase {
  if (micStatus.value === 'error') return 'error'
  if (micPaused.value) return 'paused'
  const status = micAnalyzer.value?.state.status
  return status === 'locked' || status === 'settling' ? status : 'listening'
}

/** The longest elapsed_ms the catalogue takes: an hour. A longer session reports an hour. */
const MAX_ELAPSED_MS = 3_600_000

// Every way a mic session ends reports it once: Stop, a tab switch, leaving the page (the
// tap-along link does), or Resume starting it over. Before the teardown, which clears the state.
function reportMicStop() {
  if (micStartedAt === null) return
  track('bpm_mic_stopped', {
    mic_phase: micPhase(),
    too_quiet: micGuard.wasQuiet.value,
    interrupted: micGuard.wasInterrupted.value,
    elapsed_ms: Math.min(Math.round(performance.now() - micStartedAt), MAX_ELAPSED_MS),
  })
  micStartedAt = null
}

// The analyzer died mid-session: the panel says so, the session reports 'error', and the mic,
// the level polling and the wake lock are released.
function failMic() {
  micStatus.value = 'error'
  micError.value = 'The microphone stopped unexpectedly.'
  reportMicStop()
  invalidate()
  teardownMic()
}

function stopMic() {
  reportMicStop()
  invalidate()
  teardownMic()
  micResultKept.value = false
  micStatus.value = 'idle'
  micLiveBpm.value = null
  micStableBpm.value = null
  micError.value = null
  micDenied.value = false
}

// The tap on Resume is the gesture iOS wants before audio runs again. A mic track that ended
// can't be resumed, so that session is stopped (and reported) and a new one started.
async function resumeMic() {
  const gen = generation
  const outcome = await micGuard.resume()
  // Stop, a tab switch or leaving the page while the resume was pending: never reopen the mic.
  if (gen !== generation || outcome !== 'restart') return
  stopMic()
  await startMic('mic_resume')
}

// Keyboard focus survives the panel changing under it: a lock lost, Resume gone after a resume.
watch([micStatus, micPaused], () => {
  const root = toolRoot.value
  if (!root?.contains(document.activeElement)) return
  void nextTick(() => {
    if (!root.contains(document.activeElement)) micStopButton.value?.focus()
  })
})

// The way out that needs no mic, from a blocked mic or a phone's pasted link. The picker opens in
// the same click once the idle file panel's input is on screen. A file result already there stays,
// with its own "Try another", rather than be thrown away for a picker the visitor may cancel. Focus
// goes to the file panel, since the pressed button is gone.
async function chooseFileInstead() {
  setMode('file')
  await nextTick()
  if (fileStatus.value !== 'idle') {
    toolBody.value?.querySelector<HTMLButtonElement>('.bpm-mode-file button')?.focus()
    return
  }
  chooseFileButton.value?.focus()
  openFilePicker()
}

// Try again on a blocked mic asks the browser at once: going back to the mic button first would
// show the same help again, so the first press would seem to do nothing.
function retryBlockedMic() {
  stopMic()
  void startMic()
}

function onTapAlongOffer() {
  track('bpm_tool_link_clicked', { mode: 'mic→tap-tempo', result_source: 'mic', tool: 'tap-tempo' })
}

// ─── Stream flow ─────────────────────────────────────────────────────────
// Note: with a restart period the analyzer keeps running after the
// first lock: a live radio stream has no natural "end". We
// therefore stay in the `'analysing'` status and surface the stable reading
// as a prominent pill inside the same panel, rather than transitioning to
// `'result'` (which would imply the session is finished).
function resetStreamReadings() {
  streamError.value = null
  streamLiveBpm.value = null
  streamStableBpm.value = null
  tabSharingEnded.value = false
}

// A locked reading's params: the tempo, whether it is the first since the click, and for the
// first one how long it took, the time to a first result.
function stableReading(bpm: number, first: boolean, clickedAt: number) {
  return first ? { bpm, first, elapsed_ms: Math.round(performance.now() - clickedAt) } : { bpm, first }
}

type UrlStreamParams = StreamEventParams & { input_method: 'url' }

function listenToStreamAnalyzer(analyzer: BpmAnalyzer, stableParams: UrlStreamParams | { input_method: 'tab' }, clickedAt: number) {
  // The state is current inside a reading listener. A lock can move without a
  // statechange (peaks relocks on a fuller rung), so the locked BPM follows every reading.
  analyzer.on('reading', reading => {
    streamLiveBpm.value = Math.round(reading.bpm)
    if (analyzer.state.status === 'locked') streamStableBpm.value = streamLiveBpm.value
  })

  analyzer.on('statechange', ({ to }) => {
    if (to.status !== 'locked') return
    const bpm = Math.round(to.reading.bpm)
    if (bpm !== streamStableBpm.value) {
      track('bpm_stream_locked', {
        ...stableParams,
        ...stableReading(bpm, streamStableBpm.value === null, clickedAt),
        engine: to.reading.engine,
      })
    }
    streamStableBpm.value = bpm
  })
}

// The <audio> element only says "error". Show the failure at once, then ask the
// server why (cors / network / decode / http / insecure) and send the one report
// with that reason. The caller guarantees this runs once per attempt.
async function reportStreamFailure(gen: number, url: string, eventParams: UrlStreamParams, reason: string, knownKind?: StreamErrorKind) {
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

  // Station, scheme and format, never the URL itself, which is the listener's own.
  const eventParams: UrlStreamParams = { ...streamEventParams(url), input_method: 'url' }
  track('bpm_stream_clicked', eventParams)
  const clickedAt = performance.now()

  resetStreamReadings()
  streamInput.value = 'url'
  streamStatus.value = 'analysing'

  const gen = ++generation
  // A source that answers but fails (404, CORS) fires the element's `error` event
  // AND rejects play(): whichever comes first reports it, once.
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
        engine: { name: 'peaks', restartAfterSeconds: STREAM_RESTART_SECONDS },
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
    //   source → analyzer.input                   (analysis path)
    //   source → gainNode → destination           (audio playback, mutable)
    source.connect(localAnalyzer.input)
    const localGain = localContext.createGain()
    localGain.gain.value = streamMuted.value ? GAIN_MUTED : GAIN_UNMUTED
    source.connect(localGain)
    localGain.connect(localContext.destination)

    streamGain.value = localGain

    listenToStreamAnalyzer(localAnalyzer, eventParams, clickedAt)

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
  // From the click, like the other inputs: the time in the browser's picker is part of the wait.
  const clickedAt = performance.now()

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
      engine: { name: 'peaks', restartAfterSeconds: STREAM_RESTART_SECONDS },
    })
    if (gen !== generation) throw new Error('superseded')

    // Analysis only, never to the speakers: the shared tab already plays its own sound.
    localContext.createMediaStreamSource(captured).connect(localAnalyzer.input)
    streamTabCapture.value = captured
    streamContext.value = localContext
    streamAnalyzer.value = localAnalyzer
    listenToStreamAnalyzer(localAnalyzer, { input_method: 'tab' }, clickedAt)
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
  // A result kept from an earlier mic session would make startMic a no-op: the visitor asked for a new one.
  if (micResultKept.value) stopMic()
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
  // Two literal calls, so the call-site test can check each name against the catalogue.
  if (streamMuted.value) track('bpm_stream_muted')
  else track('bpm_stream_unmuted')
}

function stopStream() {
  track('bpm_stream_stopped')
  invalidate()
  teardownStream()
  streamStatus.value = 'idle'
  resetStreamReadings()
}

onMounted(() => {
  // Whether the tool was on screen at all, and whether that took a scroll.
  const page = toolPageOf(window.location.pathname)
  if (toolBody.value) stopSeenWatch = watchToolSeen(toolBody.value, (seenOn) => track('bpm_tool_seen', { page, seen_on: seenOn }))
  tabAudioSupported.value = supportsTabAudio(navigator as NavigatorLike)
  onPhone.value = isPhone(navigator.userAgent)
  micAllowSteps.value = MIC_ALLOW_STEPS[micHelpBrowser({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints, brave: 'brave' in navigator })]
  stopPermissionWatch = watchMicPermission(navigator.permissions as PermissionsLike | undefined, (state) => { micPermission.value = state })
  if (keepsTracks.value) {
    crateStored.value = browserStore() !== null
    crateRows.value = parseCrate(readItem(browserStore(), CRATE_STORAGE_KEY))
    window.addEventListener('storage', onCrateStorage)
    // How many come back to a list they built: the size in buckets, never a name.
    if (crateRows.value.length > 0) track('bpm_crate_loaded', { rows: crateRowBucket(crateRows.value.length) })
  }
})

// ─── Cleanup on unmount ──────────────────────────────────────────────────
onBeforeUnmount(() => {
  stopPermissionWatch?.()
  // invalidate() also stops a batch: the file under analysis finishes on its own.
  window.removeEventListener('storage', onCrateStorage)
  stopSeenWatch()
  reportMicStop()
  invalidate()
  teardownMic()
  teardownStream()
})

// ─── UI helpers ──────────────────────────────────────────────────────────
// One line under the tool: the formats where a file is chosen, and where the audio goes.
const metaLine = computed(() => {
  if (mode.value !== 'file') return STAYS_ON_DEVICE
  // Choosing several files is easy to miss in a picker, so the line says it.
  const several = keepsTracks.value ? ' · Several at once' : ''
  return `${fileCopy.value.formats}${several} · ${STAYS_ON_DEVICE}`
})

// What screen readers hear: a settled reading only, once, as it arrives. A live number changes
// about once a second, and reading each one out would talk over the music. The readings are
// watched rather than the mode, so going back to a tab that still shows an old result says nothing.
const announcement = ref('')
const announce = (text: string) => { announcement.value = text }
watch(() => (fileStatus.value === 'result' ? fileBpm.value : null), (bpm) => announce(bpm === null ? '' : `${bpm} BPM`))
// A pause, lost sound or a quiet input is said once as it begins; the usual line says nothing,
// and takes back a notice that no longer holds, so it isn't left in the region after a stop.
watch(micLine, (line, previous) => {
  if (mode.value === 'mic' && micStatus.value !== 'idle' && line !== MIC_LISTENING_LINE) announce(line)
  else if (announcement.value === previous) announce('')
})
watch([micStableBpm, streamStableBpm], ([mic, stream], [oldMic]) => {
  const bpm = mic !== oldMic ? mic : stream
  announce(bpm === null ? '' : `Stable at ${bpm} BPM`)
})

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
  <div
    ref="toolRoot"
    class="bpm-hero-tool"
  >
    <slot name="heading" />
    <BpmSourceSwitch
      :options="modes"
      :selected="mode"
      @select="setMode"
    />

    <div
      ref="toolBody"
      class="bpm-tool-body"
    >
      <!-- FILE MODE -->
      <div
        v-if="mode === 'file'"
        class="bpm-mode bpm-mode-file"
      >
        <template v-if="fileStatus === 'idle'">
          <!-- The whole zone takes a drop or a click; the button is the way in for a keyboard,
               a screen reader and a touch screen, so the zone itself isn't a second control. -->
          <div
            class="bpm-drop-zone"
            :class="{ 'is-drag-over': isDragOver }"
            @click="openFilePicker"
            @dragover="onDragOver"
            @dragleave="onDragLeave"
            @drop="onDrop"
          >
            <FileAudio
              class="bpm-icon"
              :size="40"
              :stroke-width="1.5"
              aria-hidden="true"
            />
            <p class="bpm-headline">
              <span class="bpm-on-pointer">{{ fileCopy.headline }}</span>
              <span class="bpm-on-touch">{{ fileCopy.touchHeadline }}</span>
            </p>
            <button
              ref="chooseFileButton"
              type="button"
              class="bpm-primary-btn"
              @click.stop="openFilePicker"
            >
              Choose a file
            </button>
            <!-- Inside the zone, not above it: the body keeps one height, so nothing below moves. -->
            <a
              v-if="keepsTracks && crateRows.length > 0"
              class="bpm-crate-jump"
              href="#your-tracks"
              @click.stop.prevent="jumpToCrate"
            >Your tracks ({{ crateRows.length }})</a>
          </div>
          <input
            ref="fileInput"
            type="file"
            accept="audio/*,video/*"
            :multiple="keepsTracks"
            class="bpm-file-input"
            @change="onFileChange"
          />
        </template>

        <template v-else-if="fileStatus === 'analysing'">
          <div class="bpm-state bpm-state-analysing">
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
          <div class="bpm-state bpm-state-result">
            <BpmReadout
              :bpm="fileBpm"
              state="final"
            />
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
              :video="variant === 'video'"
            />
            <BeatMarkerExport
              v-if="fileTempo !== null && fileBpm !== null && fileDuration !== null && fileName !== null && fileSampleRate !== null"
              :file-name="fileName"
              :tempo="fileTempo"
              :bpm="fileBpm"
              :duration="fileDuration"
              :samples="fileSamples"
              :sample-rate="fileSampleRate"
              @searched="fileSamples = null"
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
                placement="demo_file_result"
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
        <template v-if="micStatus === 'idle' && micPermission !== 'denied'">
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
              {{ MIC_PURPOSE_LINE }}
            </div>
          </div>
        </template>

        <template v-else-if="micStatus === 'analysing'">
          <div class="bpm-state bpm-state-live">
            <BpmReadout
              :bpm="micLiveBpm"
              state="settling"
              :listening="!micPaused"
            />
            <div
              class="bpm-state-label"
              :class="{ 'is-notice': micLive && micLine !== MIC_LISTENING_LINE }"
            >
              {{ micLine }}
            </div>
            <button
              v-if="micPaused"
              type="button"
              class="bpm-primary-btn"
              @click="resumeMic"
            >
              Resume
            </button>
            <a
              v-else-if="micOfferTap"
              class="bpm-tap-offer"
              href="/tap-tempo"
              @click="onTapAlongOffer"
            >No steady beat yet? Tap along instead</a>
            <button
              ref="micStopButton"
              type="button"
              class="bpm-restart-btn"
              @click="stopMic"
            >
              Stop
            </button>
          </div>
        </template>

        <template v-else-if="micStatus === 'result'">
          <div class="bpm-state bpm-state-result">
            <BpmReadout
              :bpm="micStableBpm"
              state="stable"
              :listening="!micPaused"
            />
            <div
              class="bpm-state-label"
              :class="{ 'is-notice': micLive && micLine !== MIC_LISTENING_LINE }"
            >
              {{ micLine }}
            </div>
            <button
              v-if="micPaused"
              type="button"
              class="bpm-primary-btn"
              @click="resumeMic"
            >
              Resume
            </button>
            <ResultToolLinks
              v-if="micStableBpm !== null"
              :bpm="micStableBpm"
              source="mic"
            />
            <ExtensionResultPrompt source="mic" />
            <div class="bpm-result-actions">
              <button
                ref="micStopButton"
                type="button"
                class="bpm-restart-btn"
                @click="stopMic"
              >
                {{ micLive ? 'Stop' : 'Detect again' }}
              </button>
              <GithubStarSupport
                variant="inline"
                placement="demo_mic_stable"
              />
            </div>
          </div>
        </template>

        <template v-else>
          <div class="bpm-state bpm-state-error">
            <!-- Only the message and the steps are announced, not the buttons after them. -->
            <div
              class="bpm-mic-alert"
              role="alert"
            >
              <div class="bpm-error-msg">
                {{ micError ?? MIC_BLOCKED_LINE }}
              </div>
              <div
                v-if="micBlocked"
                class="bpm-mic-steps"
              >
                {{ micAllowSteps }}
              </div>
            </div>
            <!-- While the browser reports the site blocked, a retry can only be refused: the
                 permission's change event brings the mic button back once it is allowed. -->
            <button
              v-if="micPermission !== 'denied'"
              type="button"
              class="bpm-restart-btn"
              @click="micBlocked ? retryBlockedMic() : stopMic()"
            >
              Try again
            </button>
            <div
              v-if="micBlocked"
              class="bpm-stream-hint"
            >
              Or skip the microphone: <button
                type="button"
                class="bpm-text-btn"
                @click="chooseFileInstead"
              >
                choose a file
              </button>, or <a
                class="bpm-text-btn"
                href="/tap-tempo"
              >tap the tempo</a>.
            </div>
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
                  @click="track('extension_link_clicked', { placement: 'stream_hint', target: 'page' })"
                >Live BPM Detector</a> for Chrome and Edge shows the tempo on the page.
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
              <div
                v-if="onPhone"
                class="bpm-stream-hint"
              >
                {{ PHONE_LINK_LINE }} Or <button
                  type="button"
                  class="bpm-text-btn"
                  @click="chooseFileInstead"
                >
                  choose a file
                </button> instead.
              </div>
              <div
                v-else
                class="bpm-stream-hint"
              >
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
            <div
              v-if="STATIONS.length"
              class="bpm-stream-hint"
            >
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
          <div class="bpm-state bpm-state-live">
            <!-- A stream has no end, so the analysis keeps running after a stable reading: once
                 there is one, it is the number shown, and later readings only refine it. -->
            <BpmReadout
              :bpm="streamStableBpm ?? streamLiveBpm"
              :state="streamStableBpm === null ? 'settling' : 'stable'"
              :listening="!tabSharingEnded"
            />
            <div class="bpm-state-label">
              {{ streamLiveLabel }}
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
                placement="demo_stream_stable"
              />
            </div>
            <ResultToolLinks
              v-if="streamStableBpm !== null"
              :bpm="streamStableBpm"
              source="stream"
            />
            <ExtensionResultPrompt
              v-if="streamStableBpm !== null"
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
              v-if="streamInput === 'url' && STATIONS.length"
              class="bpm-stream-hint"
            >
              {{ STATIONS.length === 1 ? 'A station that works here:' : 'Stations that work here:' }}
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

    <p class="bpm-meta">
      {{ metaLine }}
    </p>
    <BpmCrate
      v-if="keepsTracks && mode === 'file' && (crateRows.length > 0 || batchProgress || batchFailures.length > 0 || batchSkipped > 0)"
      :rows="crateRows"
      :progress="batchProgress"
      :failures="batchFailures"
      :skipped="batchSkipped"
      :stored="crateStored"
      @remove="removeFromList"
      @clear="clearCrate"
      @dismiss-failures="dismissBatchReport"
    />
    <p
      class="bpm-announce"
      aria-live="polite"
      aria-atomic="true"
    >
      {{ announcement }}
    </p>
  </div>
</template>

<style scoped>
/* The tool is a raised card: the one object on the page that does something. The body's
   height is the tallest state's, a file result with its alternate reading, so idle, listening and a result all take the same
   room and a result arriving seconds after the click moves nothing below (CLS). */
.bpm-hero-tool {
  --bpm-body-min-height: 24rem;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  padding: 1rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 20px;
  background: var(--vp-c-bg);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.04), 0 16px 40px -20px rgb(40 30 90 / 0.28);
}

:global(.dark) .bpm-hero-tool {
  background: var(--vp-c-bg-soft);
  box-shadow: 0 16px 40px -20px rgb(0 0 0 / 0.6);
}

.bpm-tool-body {
  display: flex;
  align-items: stretch;
  min-height: var(--bpm-body-min-height);
}

.bpm-mode {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  width: 100%;
}

/* ── File ── */
.bpm-drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  width: 100%;
  min-height: var(--bpm-body-min-height);
  padding: 1.5rem 1rem;
  border: 2px dashed var(--vp-c-divider);
  border-radius: 14px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.bpm-drop-zone:hover,
.bpm-drop-zone.is-drag-over {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

.bpm-icon { color: var(--vp-c-brand-1); }

.bpm-headline {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.4;
  color: var(--vp-c-text-1);
}

/* The one device check, as everywhere on the site: a touch screen has nothing to drop. */
.bpm-on-touch { display: none; }

@media (pointer: coarse) {
  .bpm-on-pointer { display: none; }
  .bpm-on-touch { display: inline; }
}

.bpm-file-input { display: none; }

/* The card's one filled action, in the AA-safe action colours (tokens.css). */
.bpm-primary-btn,
.bpm-stream-btn {
  min-height: 44px;
  padding: 0 1.4rem;
  border-radius: 999px;
  font-size: 1rem;
  font-weight: 600;
  color: #fff;
  background: var(--rba-action);
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.bpm-primary-btn:hover,
.bpm-stream-btn:hover { background: var(--rba-action-hover); }

.bpm-stream-btn { width: 100%; border-radius: 10px; }

/* ── States ── */
.bpm-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  width: 100%;
  text-align: center;
}

.bpm-state-name {
  max-width: 100%;
  font-size: 0.875rem;
  color: var(--vp-c-text-2);
  word-break: break-all;
}

.bpm-state-label {
  font-size: 0.9375rem;
  color: var(--vp-c-text-2);
}

/* A pause, lost sound or a quiet input: said in the reading's own colour, so it is read before the number is trusted. */
.bpm-state-label.is-notice {
  font-weight: 500;
  color: var(--vp-c-text-1);
}

/* A way out when no reading comes: a link, since it leaves the page, with a full touch target. */
.bpm-tap-offer {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--vp-c-brand-1);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.bpm-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--vp-c-divider);
  border-top-color: var(--vp-c-brand-1);
  border-radius: 50%;
  animation: bpm-spin 0.8s linear infinite;
}

@keyframes bpm-spin { to { transform: rotate(360deg); } }

.bpm-result-meta {
  display: flex;
  gap: 0.4rem;
  justify-content: center;
  font-size: 0.875rem;
  color: var(--vp-c-text-2);
}

/* The way back to the list on a return visit; a link, so it reads as a place, not an action. */
.bpm-crate-jump {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--vp-c-brand-1);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.bpm-crate-jump:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.bpm-restart-btn {
  min-height: 44px;
  padding: 0 1.1rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
  cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease;
}

.bpm-restart-btn:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

/* The restart button and the star link share a row in the success states. */
.bpm-result-actions,
.bpm-stream-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: center;
  justify-content: center;
}

.bpm-state-error .bpm-error-msg {
  font-size: 0.9375rem;
  color: var(--vp-c-danger-1);
}

.bpm-mic-alert {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: center;
}

/* The way back to the mic, under the blocked line: instructions, not an error, so neutral text. */
.bpm-mic-steps {
  max-width: 34rem;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--vp-c-text-1);
}

/* ── Mic ── */
.bpm-mic-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 128px;
  height: 128px;
  border-radius: 50%;
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  cursor: pointer;
  transition: transform 0.15s ease, background-color 0.2s ease;
}

.bpm-mic-button:hover { transform: scale(1.03); }
.bpm-mic-button:active { transform: scale(0.98); }

.bpm-copy-centered { text-align: center; }

.bpm-copy .bpm-headline { font-size: 1.125rem; }

.bpm-sub {
  margin-top: 0.2rem;
  font-size: 0.9375rem;
  color: var(--vp-c-text-2);
}

/* ── Stream ── */
.bpm-mode-stream { gap: 0.6rem; }

.bpm-stream-label {
  align-self: flex-start;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--vp-c-text-2);
}

.bpm-stream-input {
  width: 100%;
  min-height: 44px;
  padding: 0 0.9rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  font-size: 1rem;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
  transition: border-color 0.2s ease;
}

.bpm-stream-input:focus { border-color: var(--vp-c-brand-1); }

.bpm-stream-hint,
.bpm-link-note {
  width: 100%;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--vp-c-text-2);
  text-align: center;
}

.bpm-stream-hint a {
  color: var(--vp-c-text-2);
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* Inline actions inside hint text (stations, the mic fallback): styled as links, so the filled
   button stays the only primary action. Inline in a sentence, so exempt from the target size. */
.bpm-text-btn {
  padding: 0;
  font: inherit;
  color: var(--vp-c-text-2);
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.bpm-text-btn:hover { color: var(--vp-c-brand-1); }

.bpm-btn-with-icon {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.bpm-btn-centered { justify-content: center; }

.bpm-btn-with-icon > :deep(svg) { flex-shrink: 0; }

/* ── Under the card's body ── */
.bpm-meta {
  /* Two lines: the file mode's line wraps on a phone, the others don't, and the card keeps one height. */
  min-height: 3em;
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--vp-c-text-2);
  text-align: center;
}

/* Heard, not seen: the settled reading for screen readers. */
.bpm-announce {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

:is(.bpm-primary-btn, .bpm-stream-btn, .bpm-restart-btn, .bpm-mic-button, .bpm-text-btn):focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

@media (min-width: 640px) {
  .bpm-hero-tool { --bpm-body-min-height: 21rem; padding: 1.5rem; }
  .bpm-meta { min-height: 0; }
  .bpm-mic-button { width: 148px; height: 148px; }
}

@media (prefers-reduced-motion: reduce) {
  .bpm-spinner { animation: none; }
  .bpm-mic-button:hover,
  .bpm-mic-button:active { transform: none; }
}
</style>
