<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Check, Copy, Hand } from 'lucide-vue-next'
import { useAnalytics } from '../composables/useAnalytics'
import {
  MAX_BPM,
  MIN_BPM,
  NOTE_DIVISIONS,
  clampBpm,
  msToBpm,
  msToHz,
  noteMs,
  parseBpmParam,
  tempoMarking,
  type NoteDivision,
  type NoteFeel,
} from '../tools/tempo'

const { track } = useAnalytics()

const NOTE_NAMES: Record<NoteDivision, string> = {
  1: 'Whole',
  2: 'Half',
  4: 'Quarter',
  8: 'Eighth',
  16: 'Sixteenth',
  32: 'Thirty-second',
  64: 'Sixty-fourth',
}
const FEELS: NoteFeel[] = ['straight', 'dotted', 'triplet']

// v-model.number yields '' while the field is empty, hence the union.
const bpmInput = ref<number | ''>(120)
const unit = ref<'ms' | 'hz'>('ms')
const delayMs = ref<number | ''>(375)
const copied = ref<string | null>(null)

const bpm = computed(() =>
  typeof bpmInput.value === 'number' && bpmInput.value > 0 ? clampBpm(bpmInput.value) : null,
)

const rows = computed(() =>
  NOTE_DIVISIONS.map((division) => ({
    division,
    name: NOTE_NAMES[division],
    cells: FEELS.map((feel) => {
      const ms = bpm.value ? noteMs(bpm.value, division, feel) : null
      return { feel, ms, text: ms === null ? '—' : format(ms) }
    }),
  })),
)

const reverse = computed(() => {
  const ms = delayMs.value
  if (typeof ms !== 'number' || ms <= 0) return null
  return [
    { label: 'as a quarter note', bpm: msToBpm(ms, 4) },
    { label: 'as an eighth note', bpm: msToBpm(ms, 8) },
    { label: 'as a dotted eighth', bpm: msToBpm(ms, 8, 'dotted') },
  ]
})

function format(ms: number): string {
  if (unit.value === 'hz') {
    const hz = msToHz(ms)
    return hz.toFixed(hz < 10 ? 3 : 2)
  }
  return String(Number(ms.toFixed(2)))
}

function commitBpm() {
  if (bpm.value !== null) bpmInput.value = Number(bpm.value.toFixed(2))
}

let copiedTimer: number | undefined
async function copy(key: string, text: string, label: string) {
  if (text === '—') return
  try {
    await navigator.clipboard.writeText(text)
    copied.value = key
    window.clearTimeout(copiedTimer)
    copiedTimer = window.setTimeout(() => (copied.value = null), 1400)
    track('bpm_delay_copied', { bpm: Math.round(bpm.value ?? 0), mode: `${label} ${unit.value}` })
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
    class="tt-card bpm-to-ms"
    aria-label="BPM to milliseconds calculator"
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
      {{ bpm ? `${tempoMarking(bpm)} · one beat = ${Number(noteMs(bpm, 4).toFixed(2))} ms = ${msToHz(noteMs(bpm, 4)).toFixed(3)} Hz` : `Enter a tempo between ${MIN_BPM} and ${MAX_BPM}` }}
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

    <div class="tt-row">
      <div
        class="tt-segmented"
        role="group"
        aria-label="Unit"
      >
        <button
          type="button"
          :aria-pressed="unit === 'ms'"
          @click="unit = 'ms'"
        >
          Milliseconds
        </button>
        <button
          type="button"
          :aria-pressed="unit === 'hz'"
          @click="unit = 'hz'"
        >
          Hertz
        </button>
      </div>
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
          Note lengths at the selected tempo, in {{ unit === 'ms' ? 'milliseconds' : 'hertz' }}. Select a value to copy it.
        </caption>
        <thead>
          <tr>
            <th scope="col">
              Note
            </th>
            <th
              v-for="feel in FEELS"
              :key="feel"
              scope="col"
            >
              {{ feel }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.division"
            :class="{ 'is-beat': row.division === 4 }"
          >
            <th scope="row">
              <span class="note-fraction">1/{{ row.division }}</span>
              <span class="note-name">{{ row.name }}</span>
            </th>
            <td
              v-for="cell in row.cells"
              :key="cell.feel"
            >
              <button
                type="button"
                class="cell"
                :class="{ 'is-copied': copied === `${row.division}-${cell.feel}` }"
                :aria-label="`Copy ${cell.text} ${unit}, ${row.name.toLowerCase()} ${cell.feel}`"
                @click="copy(`${row.division}-${cell.feel}`, cell.text, `1/${row.division} ${cell.feel}`)"
              >
                <span class="cell-value">{{ cell.text }}</span>
                <Check
                  v-if="copied === `${row.division}-${cell.feel}`"
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
          </tr>
        </tbody>
      </table>
    </div>

    <div class="reverse">
      <label class="reverse-input">
        <span class="tt-label">Have a delay time instead?</span>
        <span class="reverse-field">
          <input
            v-model.number="delayMs"
            type="number"
            inputmode="decimal"
            min="1"
            step="0.01"
            aria-label="Delay time in milliseconds"
          />
          <span>ms</span>
        </span>
      </label>
      <ul
        v-if="reverse"
        class="reverse-results"
      >
        <li
          v-for="item in reverse"
          :key="item.label"
        >
          <strong>{{ item.bpm.toFixed(2) }}</strong> BPM <span>{{ item.label }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.bpm-input {
  padding: 0;
  border: 0;
  background: transparent;
  /* The negative letter-spacing makes the digits narrower than their ch
     width; right-aligning puts that slack away from the BPM unit. */
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
  white-space: nowrap;
}

.vp-doc .tt-table td { padding: 0; }

.note-fraction {
  display: inline-block;
  min-width: 2.6rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-1);
}

.note-name {
  font-size: 0.85rem;
  font-weight: 400;
  color: var(--vp-c-text-2);
}

.vp-doc .tt-table tr.is-beat th,
.vp-doc .tt-table tr.is-beat td {
  background: var(--vp-c-brand-soft);
}

.vp-doc .tt-table tr.is-beat th { border-radius: 12px 0 0 12px; }
.vp-doc .tt-table tr.is-beat td:last-child { border-radius: 0 12px 12px 0; }

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

.reverse {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 1.5rem;
  padding: 1rem 1.25rem;
  border: 1px dashed var(--vp-c-divider);
  border-radius: 16px;
}

.reverse-input {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.reverse-field {
  display: inline-flex;
  align-items: baseline;
  gap: 0.35rem;
  color: var(--vp-c-text-2);
}

.reverse-field input {
  width: 7rem;
  padding: 0.35rem 0.6rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg);
  font-size: 1.1rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-1);
}

.vp-doc .reverse-results {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.9rem;
  color: var(--vp-c-text-2);
}

.vp-doc .reverse-results li { margin: 0.15rem 0; }

.reverse-results strong {
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-brand-1);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
