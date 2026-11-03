<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Check, Copy, Hand } from 'lucide-vue-next'
import { useAnalytics } from '../composables/useAnalytics'
import { MAX_BPM, MIN_BPM, clampBpm, noteMs, parseBpmParam, tempoMarking } from '../tools/tempo'
import {
  FRAME_RATES,
  MAX_BEATS_PER_BAR,
  MAX_FPS,
  MIN_BEATS_PER_BAR,
  MIN_FPS,
  framesPerBeat,
  framesPerBeats,
  isWholeFrames,
  parseFps,
  roundingDrift,
  type FrameRate,
} from '../tools/frames'

const { track } = useAnalytics()

// v-model.number yields '' while the field is empty, hence the union.
const bpmInput = ref<number | ''>(120)
const beatsInput = ref<number | ''>(4)
const customFps = ref('')
const copied = ref<string | null>(null)

const bpm = computed(() =>
  typeof bpmInput.value === 'number' && bpmInput.value > 0 ? clampBpm(bpmInput.value) : null,
)

const beatsPerBar = computed(() => {
  const beats = beatsInput.value
  if (typeof beats !== 'number' || !Number.isInteger(beats)) return 4
  return Math.min(MAX_BEATS_PER_BAR, Math.max(MIN_BEATS_PER_BAR, beats))
})

const custom = computed<FrameRate | null>(() => {
  const fps = parseFps(customFps.value)
  if (fps === null || FRAME_RATES.some((rate) => rate.fps === fps)) return null
  return { fps, label: String(fps) }
})

const rows = computed(() => {
  const rates = custom.value ? [...FRAME_RATES, custom.value] : FRAME_RATES
  return rates.map((rate) => {
    const current = bpm.value
    // No tempo yet: empty cells, and their copy buttons are disabled.
    if (current === null) return { ...rate, beat: '', bar: '', drift: '', isCustom: rate === custom.value }
    const bar = framesPerBeats(current, rate.fps, beatsPerBar.value)
    return {
      ...rate,
      beat: format(framesPerBeat(current, rate.fps)),
      bar: format(bar),
      drift: driftText(bar, rate.fps),
      isCustom: rate === custom.value,
    }
  })
})

function format(frames: number): string {
  return String(Number(frames.toFixed(3)))
}

function driftText(exactFrames: number, fps: number): string {
  if (isWholeFrames(exactFrames)) return 'none'
  const drift = roundingDrift(exactFrames, fps)
  const sign = drift.frames > 0 ? '+' : '−'
  return `${drift.rounded} f: ${sign}${format(Math.abs(drift.frames))} f (${sign}${Math.abs(drift.ms).toFixed(1)} ms)`
}

function commitBpm() {
  if (bpm.value !== null) bpmInput.value = Number(bpm.value.toFixed(2))
}

let copiedTimer: number | undefined
async function copy(key: string, text: string, label: string) {
  if (text === '') return
  try {
    await navigator.clipboard.writeText(text)
    copied.value = key
    window.clearTimeout(copiedTimer)
    copiedTimer = window.setTimeout(() => (copied.value = null), 1400)
    track('bpm_frames_copied', { bpm: Math.round(bpm.value ?? 0), mode: label })
  } catch {
    // Clipboard refused (permissions, insecure context): the value stays
    // selectable on screen, so there is nothing to recover.
    copied.value = null
  }
}

onMounted(() => {
  const fromUrl = parseBpmParam(new URLSearchParams(window.location.search).get('bpm'))
  if (fromUrl !== null) bpmInput.value = fromUrl
})
</script>

<template>
  <section
    class="tt-card bpm-to-frames"
    aria-label="BPM to frames calculator"
  >
    <label class="tt-field">
      <span class="tt-label">Tempo</span>
      <span class="tt-readout">
        <input
          v-model.number="bpmInput"
          class="tt-number bpm-input"
          type="number"
          inputmode="decimal"
          :min="MIN_BPM"
          :max="MAX_BPM"
          step="0.01"
          :style="{ width: `${Math.max(2, String(bpmInput).length)}ch` }"
          aria-label="Tempo in beats per minute"
          @change="commitBpm"
        />
        <span class="tt-unit">BPM</span>
      </span>
    </label>
    <p class="tt-caption">
      {{ bpm ? `${tempoMarking(bpm)} · one beat = ${Number(noteMs(bpm, 4).toFixed(2))} ms` : `Enter a tempo between ${MIN_BPM} and ${MAX_BPM}` }}
    </p>
    <input
      v-model.number="bpmInput"
      class="tt-range"
      type="range"
      :min="MIN_BPM"
      :max="MAX_BPM"
      step="1"
      aria-label="Tempo slider"
    />

    <div class="tt-row options">
      <label class="option">
        <span class="tt-label">Beats per bar</span>
        <input
          v-model.number="beatsInput"
          type="number"
          inputmode="numeric"
          :min="MIN_BEATS_PER_BAR"
          :max="MAX_BEATS_PER_BAR"
          step="1"
          aria-label="Beats per bar"
        />
      </label>
      <label class="option">
        <span class="tt-label">Custom frame rate</span>
        <input
          v-model="customFps"
          type="text"
          inputmode="decimal"
          placeholder="e.g. 48"
          :aria-label="`Custom frame rate, ${MIN_FPS} to ${MAX_FPS} fps`"
        />
      </label>
      <a
        class="tt-chip"
        href="/tap-tempo"
      >
        <Hand :size="15" /> Tap the tempo
      </a>
    </div>

    <div class="table-wrap">
      <table class="tt-table">
        <caption class="visually-hidden">
          Frames per beat and per bar of {{ beatsPerBar }} beats at the selected tempo. Select a value to copy it.
        </caption>
        <thead>
          <tr>
            <th scope="col">
              fps
            </th>
            <th scope="col">
              1 beat
            </th>
            <th scope="col">
              1 bar ({{ beatsPerBar }})
            </th>
            <th scope="col">
              Rounded bar, drift
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.label"
            :class="{ 'is-custom': row.isCustom }"
          >
            <th scope="row">
              {{ row.label }}
            </th>
            <td
              v-for="cell in (['beat', 'bar'] as const)"
              :key="cell"
            >
              <button
                type="button"
                class="cell"
                :class="{ 'is-copied': copied === `${row.label}-${cell}` }"
                :disabled="row[cell] === ''"
                :aria-label="`Copy ${row[cell]} frames per ${cell} at ${row.label} fps`"
                @click="copy(`${row.label}-${cell}`, row[cell], `${row.label} fps ${cell}`)"
              >
                <span>{{ row[cell] }}</span>
                <Check
                  v-if="copied === `${row.label}-${cell}`"
                  :size="14"
                  class="cell-icon"
                />
                <Copy
                  v-else
                  :size="14"
                  class="cell-icon"
                />
              </button>
            </td>
            <td class="drift">
              {{ row.drift }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p
      v-if="customFps.trim() !== '' && parseFps(customFps) === null"
      class="tt-caption"
      role="alert"
    >
      Enter a frame rate between {{ MIN_FPS }} and {{ MAX_FPS }}.
    </p>
  </section>
</template>

<style scoped>
.bpm-input {
  padding: 0;
  border: 0;
  background: transparent;
  text-align: right;
  font-family: inherit;
  line-height: 1;
  -moz-appearance: textfield;
  appearance: textfield;
}

.bpm-input::-webkit-outer-spin-button,
.bpm-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.bpm-input:focus-visible {
  outline: none;
  border-radius: 12px;
  box-shadow: 0 0 0 2px var(--vp-c-brand-1);
}

.options { align-items: flex-end; }

.option {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.option input {
  width: 7rem;
  padding: 0.35rem 0.6rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg);
  font-size: 1rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-1);
}

.table-wrap {
  margin-top: 1.5rem;
  overflow-x: auto;
}

.vp-doc .tt-table {
  display: table;
  width: 100%;
  margin: 0;
  border-collapse: separate;
  border-spacing: 0 4px;
}

.vp-doc .tt-table tr,
.vp-doc .tt-table th,
.vp-doc .tt-table td {
  border: 0;
  background: transparent;
}

.vp-doc .tt-table thead th {
  padding: 0 0.5rem 0.25rem;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
  text-align: right;
}

.vp-doc .tt-table thead th:first-child { text-align: left; }

.vp-doc .tt-table tbody th {
  padding: 0.35rem 0.5rem;
  text-align: left;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.vp-doc .tt-table td { padding: 0; }

.vp-doc .tt-table td.drift {
  padding: 0.35rem 0.6rem;
  text-align: right;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-2);
  white-space: nowrap;
}

.vp-doc .tt-table tr.is-custom th,
.vp-doc .tt-table tr.is-custom td {
  background: var(--vp-c-brand-soft);
}

.cell {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.4rem;
  width: 100%;
  padding: 0.45rem 0.6rem;
  border-radius: 10px;
  font-size: 1rem;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-1);
  transition: background 0.15s ease, color 0.15s ease;
}

.cell:hover { background: var(--vp-c-bg); color: var(--vp-c-brand-1); }

.cell:disabled { cursor: default; background: none; }
.cell:disabled .cell-icon { display: none; }

.cell-icon {
  flex-shrink: 0;
  opacity: 0;
  color: var(--vp-c-text-3);
  transition: opacity 0.15s ease;
}

.cell:hover .cell-icon,
.cell:focus-visible .cell-icon { opacity: 1; }

.cell.is-copied { color: var(--vp-c-green-1); }
.cell.is-copied .cell-icon { opacity: 1; color: var(--vp-c-green-1); }

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
