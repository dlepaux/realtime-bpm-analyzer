<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ChevronDown, Download } from 'lucide-vue-next'
import { useAnalytics } from '../composables/useAnalytics'
import {
  IMPORT_STEPS,
  MARKER_FORMATS,
  beatMarkers,
  markerFile,
  timecodeChoice,
  timecodesFor,
  type MarkerExport,
  type MarkerFormat,
} from '../tools/beat-markers'
import { fallbackNote, firstBeatOf, fitTempo, onsetCurveInSlices, type GridTempo } from '../tools/first-beat'

// The "Export beat markers" step on a file result (RBA-127): a fixed grid at the exact tempo
// from the first strong onset, so it only suits steady tempos, and the copy says so. It is also
// the RBA-109 demand test: `bpm_markers_exported` fires once per result, on the first download,
// so exports divided by `bpm_file_result` reads the share of results that exported. The parent
// mounts a fresh instance per result (v-if on the result state), which resets that.
// The step reads as the result's action, a filled pill, since a small link under the result went
// unseen (RBA-116). On /beat-markers, where a visitor came for the markers, it opens by itself.
const props = defineProps<{
  /** The analysed file's name: the sequence name and the download's name, never sent anywhere. */
  fileName: string
  /**
   * The library's unrounded tempo, Reading.bpmExact. It seeds fitTempo, which refines it from
   * the audio here, and is never shown (RBA-128).
   */
  tempo: number
  /** Reading.bpm, the whole number the result shows. */
  bpm: number
  duration: number
  /**
   * The decoded audio's first channel, read on this device only. The parent drops it once the
   * search has run (`searched`), so it is null after that: the found beat is all the grid needs.
   */
  samples: Float32Array | null
  sampleRate: number
  /**
   * Open on arrival, measuring at once: the /beat-markers page, where the export is the point.
   * The open panel grows the result card past its reserved height, so the page below moves when
   * the result lands and again when the grid is ready. Accepted (RBA-116): it follows the
   * visitor's own drop, on the one page that asked for the panel, and reserving its height would
   * make the empty drop zone twice as tall.
   */
  startOpen?: boolean
}>()

const emit = defineEmits<{ searched: [] }>()

const { track } = useAnalytics()

const format = ref<MarkerFormat>('fcp7xml')
const timecodeId = ref('24')
let reported = false

// The grid is measured only when the step is opened, a slice at a time: most results are never
// exported, and a long song would otherwise hold up the page.
type Search = 'idle' | 'searching' | 'done'
const search = ref<Search>('idle')
const grid = ref<{ firstBeat: number; tempo: GridTempo } | null>(null)
let unmounted = false
onBeforeUnmount(() => { unmounted = true })

const nextTask = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0))

function onToggle(event: Event) {
  if ((event.target as HTMLDetailsElement).open) void measure()
}

// Opened by itself, the panel measures from mount rather than wait on the toggle event the
// browser queues for an element created open: the guard below makes a second call a no-op.
onMounted(() => {
  if (props.startOpen) void measure()
})

async function measure() {
  if (search.value !== 'idle') return
  const samples = props.samples
  search.value = 'searching'
  try {
    const curve = samples === null ? null : await onsetCurveInSlices(samples, props.sampleRate, nextTask, () => unmounted)
    if (curve !== null) {
      // fitTempo refines the exact reading: the grid's phase for the first beat, and the fit to
      // the last beat of a long song. A weak fit keeps the exact reading.
      const tempo = fitTempo(curve, props.tempo)
      const firstBeat = firstBeatOf(curve, tempo)
      grid.value = firstBeat === null ? null : { firstBeat, tempo }
    }
  } catch (error) {
    console.error('[BeatMarkerExport] beat grid failed:', error)
    grid.value = null
  }
  search.value = 'done'
  // Every later export reuses the grid, so the audio (about 115 MB for 10 min at 48 kHz) can go.
  if (!unmounted) emit('searched')
}

// Only a fitted grid is "measured from the file": a weak fit steps at the analyzer's estimate,
// which the note under the download button says, so this line mustn't claim otherwise.
const intro = computed(() => (grid.value?.tempo.fitted
  ? 'A marker on every beat, from the first strong beat, at the tempo measured from the file to a fraction of a BPM.'
  : 'A marker on every beat, from the first strong beat.'))
const note = computed(() => (grid.value === null ? null : fallbackNote(grid.value.tempo, props.bpm)))
const timecodes = computed(() => timecodesFor(format.value))
const choice = computed(() => timecodeChoice(format.value, timecodeId.value))
// The Premiere XML has no 59.94 DF: switching to it moves that choice to 59.94 NDF.
watch(format, () => { timecodeId.value = choice.value.id })
// One input for the count and the file: how many beats fit depends on the frame rate, since a
// beat in the sequence's last half frame isn't written (RBA-239).
const exportInput = computed<MarkerExport | null>(() => (grid.value === null ? null : {
  name: props.fileName,
  bpm: grid.value.tempo.bpm,
  firstBeat: grid.value.firstBeat,
  duration: props.duration,
  rate: choice.value.rate,
  dropFrame: choice.value.dropFrame,
}))
const markerCount = computed(() => (exportInput.value === null ? 0 : beatMarkers(exportInput.value).length))

function download() {
  const input = exportInput.value
  if (input === null || markerCount.value === 0) return
  const file = markerFile(format.value, input)
  const url = URL.createObjectURL(new Blob([file.content], { type: file.mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  // Revoked later, not at once: some browsers read the blob after click() returns.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)

  if (!reported) {
    reported = true
    // `format` keeps its old meaning for the readback; export_format names it alone (RBA-154).
    track('bpm_markers_exported', { format: format.value, frame_rate: choice.value.id, export_format: format.value })
  }
}
</script>

<template>
  <details
    class="marker-export"
    :open="startOpen"
    @toggle="onToggle"
  >
    <!-- A summary is a button to assistive tech, named by its text and announced as expanded or
         collapsed, so it needs no ARIA of its own. -->
    <summary class="marker-action">
      <Download
        :size="18"
        :stroke-width="2"
        aria-hidden="true"
      />
      <span>Export beat markers</span>
      <ChevronDown
        class="marker-chevron"
        :size="16"
        :stroke-width="2"
        aria-hidden="true"
      />
    </summary>
    <p class="marker-note">
      {{ intro }} For songs with a steady tempo. Check that the first marker and the last one sit
      on the beat before you cut.
    </p>
    <p
      v-if="search !== 'done'"
      class="marker-note"
    >
      Measuring the beat…
    </p>
    <p
      v-else-if="grid === null || markerCount === 0"
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
              v-for="entry in timecodes"
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
      <p
        v-if="note !== null"
        class="marker-note"
      >
        {{ note }}
      </p>
      <p class="marker-note">
        First marker at {{ grid.firstBeat.toFixed(2) }} s. The file is made on this device.
      </p>
    </template>
  </details>
</template>

<style scoped>
/* No top margin: the result's own gap spaces it, and the pill is already taller than the old link
   was, inside the room the card keeps for a result (RBA-66). */
.marker-export {
  font-size: 0.85rem;
  text-align: left;
}

/* The result's action: the card's filled colours (tokens.css), at a finger's size. A flex summary
   drops the disclosure triangle, so the chevron shows the open state instead. */
.marker-action {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: fit-content;
  min-height: 44px;
  margin: 0 auto;
  padding: 0 1.2rem;
  border-radius: 999px;
  font-size: 0.9375rem;
  font-weight: 600;
  color: #fff;
  background: var(--rba-action);
  cursor: pointer;
  list-style: none;
  transition: background-color 0.2s ease;
}

.marker-action::-webkit-details-marker { display: none; }
.marker-action:hover { background: var(--rba-action-hover); }
.marker-action > svg { flex-shrink: 0; }
.marker-chevron { transition: transform 0.2s ease; }
.marker-export[open] .marker-chevron { transform: rotate(180deg); }

/* Open, the toggle steps back to an outline, so the download is the one filled action left. */
.marker-export[open] .marker-action {
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
  box-shadow: inset 0 0 0 1px var(--vp-c-divider);
}

.marker-export[open] .marker-action:hover { box-shadow: inset 0 0 0 1px var(--vp-c-brand-1); }

@media (prefers-reduced-motion: reduce) {
  .marker-chevron { transition: none; }
}

/* No radius here: the outline follows each control's own shape, and a pill keeps its round ends. */
.marker-action:focus-visible,
.marker-export select:focus-visible,
.marker-download:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
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

/* The site's filled-button colours (tokens.css), AA in both themes: white on brand-1 was about
   2:1 in dark mode, and on /beat-markers this is the page's main action. */
.marker-download {
  min-height: 44px;
  margin-top: 0.6rem;
  padding: 0 1.2rem;
  font: inherit;
  font-weight: 600;
  color: #fff;
  background: var(--rba-action);
  border: none;
  border-radius: 999px;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.marker-download:hover { background: var(--rba-action-hover); }
</style>
