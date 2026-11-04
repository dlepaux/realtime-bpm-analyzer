<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useAnalytics } from '../composables/useAnalytics'
import {
  EXPORT_TIMECODES,
  MARKER_FORMATS,
  beatTimes,
  markerFile,
  type MarkerFormat,
} from '../tools/beat-markers'
import { firstBeatSecondsInSlices } from '../tools/first-beat'

// The "Export beat markers" step on a file result (RBA-127): a fixed grid at the detected tempo
// from the first strong onset, so it only suits steady tempos, and the copy says so. It is also
// the RBA-109 demand test: `bpm_markers_exported` fires once per result, on the first download,
// so exports divided by `bpm_file_result` reads the share of results that exported. The parent
// mounts a fresh instance per result (v-if on the result state), which resets that.
const props = defineProps<{
  /** The analysed file's name: the sequence name and the download's name, never sent anywhere. */
  fileName: string
  /**
   * The tempo the grid steps at. The engine returns whole BPM only (tempo.ts and tempogram.ts
   * round), so today this equals `bpm`, and a real tempo between two whole numbers drifts the
   * grid over a long song. The copy says so. A fractional tempo is RBA-109 work in packages/.
   */
  tempo: number
  /** Rounded, as the result shows it. */
  bpm: number
  duration: number
  /**
   * The decoded audio's first channel, read on this device only. The parent drops it once the
   * search has run (`searched`), so it is null after that: the found beat is all the grid needs.
   */
  samples: Float32Array | null
  sampleRate: number
}>()

const emit = defineEmits<{ searched: [] }>()

const { track } = useAnalytics()

const IMPORT_STEPS: Record<MarkerFormat, string> = {
  fcp7xml: 'In Premiere Pro: File > Import, then pick the file. It adds a sequence with a marker on every beat.',
  edl: 'In DaVinci Resolve: right-click your timeline in the Media Pool, then Timelines > Import > Timeline Markers from EDL. The markers assume the timeline starts at 01:00:00:00.',
  fcpxml: 'In Final Cut Pro: File > Import > XML. It adds a project with a marker on every beat.',
  csv: 'One row per beat, with the time in seconds, the frame and the timecode.',
}

const format = ref<MarkerFormat>('fcp7xml')
const timecodeId = ref('24')
let reported = false

// The first beat is looked for only when the step is opened, a slice at a time: most results
// are never exported, and a long song would otherwise hold up the page.
type Search = 'idle' | 'searching' | 'done'
const search = ref<Search>('idle')
const firstBeat = ref<number | null>(null)
let unmounted = false
onBeforeUnmount(() => { unmounted = true })

const nextTask = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0))

async function onToggle(event: Event) {
  if (!(event.target as HTMLDetailsElement).open || search.value !== 'idle') return
  const samples = props.samples
  search.value = 'searching'
  try {
    firstBeat.value = samples === null
      ? null
      : await firstBeatSecondsInSlices(samples, props.sampleRate, props.tempo, nextTask, () => unmounted)
  } catch (error) {
    console.error('[BeatMarkerExport] first beat failed:', error)
    firstBeat.value = null
  }
  search.value = 'done'
  // Every later export reuses firstBeat, so the audio (about 115 MB for 10 min at 48 kHz) can go.
  if (!unmounted) emit('searched')
}

const choice = computed(() => EXPORT_TIMECODES.find((entry) => entry.id === timecodeId.value) ?? EXPORT_TIMECODES[1]!)
const markerCount = computed(() =>
  firstBeat.value === null ? 0 : beatTimes(props.tempo, firstBeat.value, props.duration).length)

function download() {
  if (firstBeat.value === null || markerCount.value === 0) return
  const file = markerFile(format.value, {
    name: props.fileName,
    bpm: props.tempo,
    firstBeat: firstBeat.value,
    duration: props.duration,
    rate: choice.value.rate,
    dropFrame: choice.value.dropFrame,
  })
  const url = URL.createObjectURL(new Blob([file.content], { type: file.mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  // Revoked later, not at once: some browsers read the blob after click() returns.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)

  if (!reported) {
    reported = true
    track('bpm_markers_exported', { format: format.value, frame_rate: choice.value.id })
  }
}
</script>

<template>
  <details
    class="marker-export"
    @toggle="onToggle"
  >
    <summary>Export beat markers</summary>
    <p class="marker-note">
      A marker on every beat at {{ bpm }} BPM, from the first strong beat. For songs with a
      steady tempo. The markers use the whole-number tempo, so on a long song they can slide off
      the beat when the real tempo sits between two numbers. Check that the first marker and the
      last one sit on the beat before you cut.
    </p>
    <p
      v-if="search !== 'done'"
      class="marker-note"
    >
      Finding the first beat…
    </p>
    <p
      v-else-if="firstBeat === null || markerCount === 0"
      class="marker-note"
    >
      No clear first beat in this file, so there are no markers to export.
    </p>
    <template v-else>
      <div class="marker-fields">
        <label>
          <span>Format</span>
          <select v-model="format">
            <option
              v-for="entry in MARKER_FORMATS"
              :key="entry.id"
              :value="entry.id"
            >{{ entry.label }}</option>
          </select>
        </label>
        <label>
          <span>Frame rate</span>
          <select v-model="timecodeId">
            <option
              v-for="entry in EXPORT_TIMECODES"
              :key="entry.id"
              :value="entry.id"
            >{{ entry.label }}</option>
          </select>
        </label>
      </div>
      <p class="marker-note">
        {{ IMPORT_STEPS[format] }}
      </p>
      <button
        type="button"
        class="marker-download"
        @click="download"
      >
        Download {{ markerCount }} markers
      </button>
      <p class="marker-note">
        First marker at {{ firstBeat.toFixed(2) }} s. The file is made on this device.
      </p>
    </template>
  </details>
</template>

<style scoped>
.marker-export {
  margin-top: 0.6rem;
  font-size: 0.85rem;
  text-align: left;
}

.marker-export summary {
  cursor: pointer;
  text-align: center;
  font-weight: 500;
  color: var(--vp-c-brand-1);
}

.marker-export summary:focus-visible,
.marker-export select:focus-visible,
.marker-download:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
  border-radius: 4px;
}

.marker-note {
  margin: 0.5rem 0 0;
  color: var(--vp-c-text-2);
  line-height: 1.45;
}

.marker-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  margin-top: 0.6rem;
}

.marker-fields label {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  color: var(--vp-c-text-2);
}

.marker-fields select {
  padding: 0.3rem 0.5rem;
  font: inherit;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
}

.marker-download {
  margin-top: 0.6rem;
  padding: 0.45rem 1rem;
  font: inherit;
  font-weight: 500;
  color: var(--vp-c-white);
  background: var(--vp-c-brand-1);
  border: none;
  border-radius: 999px;
  cursor: pointer;
}

.marker-download:hover { background: var(--vp-c-brand-2); }
</style>
