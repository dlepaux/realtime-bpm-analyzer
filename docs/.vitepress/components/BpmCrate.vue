<script setup lang="ts">
// "Your tracks" (RBA-277): the file results kept in this browser. The rows come from the
// parent, which owns them and their storage; this shows, sorts, filters and exports them, and
// remembers how the visitor last sorted and filtered.
import { computed, onMounted, ref, watch } from 'vue'
import {
  CRATE_MAX_ROWS,
  CRATE_VIEW_STORAGE_KEY,
  crateToCsv,
  crateToText,
  filterByRange,
  hasRange,
  matchInRange,
  parseCrateView,
  rowKey,
  serializeCrateView,
  sortCrate,
  toBound,
  type CrateRow,
  type CrateSort,
} from '../tools/bpm-crate'
import { browserStore, readItem, writeItem } from '../tools/local-store'

const props = defineProps<{
  rows: readonly CrateRow[]
  /** "Analysing 3 of 12", while a batch runs. */
  progress: string | null
  /** Names of the files of the last batch that gave no reading. */
  failures: readonly string[]
  /** Files left out of the last batch past its cap, 0 when none. */
  skipped: number
}>()
const emit = defineEmits<{ remove: [key: string], clear: [], dismissFailures: [] }>()

/** Rows shown before "Show all": the list sits under the tool, and a long one would bury the page. */
const COLLAPSED_ROWS = 5

const sort = ref<CrateSort>('recent')
// The fields' text as typed; the bounds are read from it, so an empty or half-typed field is no limit.
const lowText = ref('')
const highText = ref('')
const expanded = ref(false)
const copyState = ref<'idle' | 'copied' | 'failed'>('idle')

const low = computed(() => toBound(lowText.value))
const high = computed(() => toBound(highText.value))
const ranged = computed(() => hasRange({ low: low.value, high: high.value }))

const shown = computed(() => {
  const sorted = sortCrate(props.rows, sort.value)
  return ranged.value ? filterByRange(sorted, low.value, high.value) : sorted
})
const visible = computed(() => (expanded.value ? shown.value : shown.value.slice(0, COLLAPSED_ROWS)))
const countLine = computed(() => {
  const total = props.rows.length
  if (ranged.value) return `${shown.value.length} of ${total} shown`
  return total === 1 ? '1 track' : `${total} tracks`
})

const formatTempo = (tempo: number) => String(Math.round(tempo * 10) / 10)
/** "85 → 170" when the row is in the range at double or half its tempo. */
function octaveNote(row: CrateRow): string | null {
  if (!ranged.value) return null
  const matched = matchInRange(row.bpm, low.value, high.value)
  return matched === null || matched === row.bpm ? null : `→ ${formatTempo(matched)}`
}

onMounted(() => {
  const view = parseCrateView(readItem(browserStore(), CRATE_VIEW_STORAGE_KEY))
  sort.value = view.sort
  lowText.value = view.low === null ? '' : String(view.low)
  highText.value = view.high === null ? '' : String(view.high)
})

watch([sort, low, high], () => {
  writeItem(browserStore(), CRATE_VIEW_STORAGE_KEY, serializeCrateView({ sort: sort.value, low: low.value, high: high.value }))
})

function clearRange() {
  lowText.value = ''
  highText.value = ''
}

let copyTimer: ReturnType<typeof setTimeout> | undefined
async function copyList() {
  try {
    await navigator.clipboard.writeText(crateToText(shown.value))
    copyState.value = 'copied'
  } catch {
    // No clipboard (an insecure context, a refused permission): the CSV still works.
    copyState.value = 'failed'
  }
  clearTimeout(copyTimer)
  copyTimer = setTimeout(() => { copyState.value = 'idle' }, 2000)
}

function downloadCsv() {
  const url = URL.createObjectURL(new Blob([crateToCsv(shown.value)], { type: 'text/csv;charset=utf-8' }))
  const link = Object.assign(document.createElement('a'), { href: url, download: 'your-tracks-bpm.csv' })
  link.click()
  // Revoked on the next turn: some browsers start the download only after the click handler returns.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function confirmClear() {
  if (window.confirm('Remove every track from this list? This only clears this browser.')) emit('clear')
}
</script>

<template>
  <section
    id="your-tracks"
    class="crate"
    aria-labelledby="your-tracks-title"
    tabindex="-1"
  >
    <header class="crate-head">
      <h3
        id="your-tracks-title"
        class="crate-title"
      >
        Your tracks <span class="crate-count">{{ countLine }}</span>
      </h3>
      <p class="crate-note">
        Kept in this browser only, never uploaded, up to {{ CRATE_MAX_ROWS }} tracks.
        Clearing your browser data erases it: download the CSV to keep a copy.
      </p>
    </header>

    <p
      v-if="progress"
      class="crate-progress"
      role="status"
    >
      {{ progress }}
    </p>
    <div
      v-if="failures.length > 0 || skipped > 0"
      class="crate-failures"
      role="status"
    >
      <p v-if="failures.length > 0">
        No reading for {{ failures.length === 1 ? 'this file' : `these ${failures.length} files` }}:
        <span class="crate-failure-names">{{ failures.join(', ') }}</span>
      </p>
      <p v-if="skipped > 0">
        {{ skipped }} more {{ skipped === 1 ? 'file was' : 'files were' }} left out: drop them in a second batch.
      </p>
      <button
        type="button"
        class="crate-link"
        @click="emit('dismissFailures')"
      >
        Dismiss
      </button>
    </div>

    <div
      v-if="rows.length > 0"
      class="crate-tools"
    >
      <label class="crate-field">
        Sort
        <select v-model="sort">
          <option value="recent">Latest first</option>
          <option value="bpm">BPM</option>
          <option value="name">Name</option>
        </select>
      </label>
      <fieldset class="crate-field crate-range">
        <legend class="crate-legend">
          BPM range
        </legend>
        <input
          v-model="lowText"
          type="number"
          inputmode="numeric"
          min="20"
          max="400"
          placeholder="from"
          class="crate-num"
          aria-label="Lowest BPM"
        />
        to
        <input
          v-model="highText"
          type="number"
          inputmode="numeric"
          min="20"
          max="400"
          placeholder="to"
          class="crate-num"
          aria-label="Highest BPM"
        />
        <button
          v-if="ranged"
          type="button"
          class="crate-link"
          @click="clearRange"
        >
          All
        </button>
      </fieldset>
    </div>
    <p
      v-if="low !== null && high !== null && rows.length > 0"
      class="crate-hint"
    >
      Half and double tempos count too.
    </p>

    <ol
      v-if="rows.length > 0"
      class="crate-list"
    >
      <li
        v-for="row in visible"
        :key="rowKey(row)"
        class="crate-row"
      >
        <span
          class="crate-name"
          :title="row.name"
        >{{ row.name }}</span>
        <a
          class="crate-bpm"
          :href="`/metronome?bpm=${row.bpm}`"
          :aria-label="`${row.bpm} BPM, open the metronome at this tempo`"
        >{{ row.bpm }}<small>BPM</small></a>
        <span
          v-if="octaveNote(row)"
          class="crate-octave"
        >{{ octaveNote(row) }}</span>
        <button
          type="button"
          class="crate-remove"
          :aria-label="`Remove ${row.name}`"
          @click="emit('remove', rowKey(row))"
        >
          ×
        </button>
      </li>
      <li
        v-if="shown.length === 0"
        class="crate-empty"
      >
        No track in that range.
      </li>
    </ol>
    <button
      v-if="shown.length > COLLAPSED_ROWS"
      type="button"
      class="crate-link crate-more"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      {{ expanded ? 'Show fewer' : `Show all ${shown.length}` }}
    </button>

    <div
      v-if="rows.length > 0"
      class="crate-actions"
    >
      <button
        type="button"
        class="crate-btn"
        :disabled="shown.length === 0"
        @click="copyList"
      >
        {{ copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy list' }}
      </button>
      <button
        type="button"
        class="crate-btn"
        :disabled="shown.length === 0"
        @click="downloadCsv"
      >
        Download CSV
      </button>
      <button
        type="button"
        class="crate-link crate-clear"
        @click="confirmClear"
      >
        Clear list
      </button>
    </div>
  </section>
</template>

<style scoped>
.crate {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-top: 0.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--vp-c-divider);
  text-align: left;
  scroll-margin-top: calc(var(--vp-nav-height, 64px) + 1rem);
}

.crate:focus { outline: none; }

.crate-title {
  margin: 0;
  padding: 0;
  border: 0;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.5;
  letter-spacing: normal;
}
.crate-count { margin-left: 0.35rem; font-weight: 500; color: var(--vp-c-text-2); }
.crate-note { margin: 0.15rem 0 0; font-size: 0.8rem; line-height: 1.5; color: var(--vp-c-text-2); }

.crate-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 1.25rem; font-size: 0.85rem; color: var(--vp-c-text-2); }
.crate-field { display: inline-flex; align-items: center; gap: 0.35rem; }
.crate-range { margin: 0; padding: 0; border: 0; }
.crate-legend { float: left; margin-right: 0.35rem; padding: 0; }
.crate-field select, .crate-num {
  min-height: 36px;
  padding: 0.15rem 0.35rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font: inherit;
}
.crate-num { width: 4.5rem; }
.crate-hint { margin: 0; font-size: 0.8rem; color: var(--vp-c-text-2); }

.crate-progress { margin: 0; font-size: 0.85rem; color: var(--vp-c-brand-1); }

.crate-failures {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
  padding: 0.6rem 0.75rem;
  border-radius: 8px;
  background: var(--vp-c-warning-soft);
  font-size: 0.85rem;
  color: var(--vp-c-text-1);
}
.crate-failures p { margin: 0; }
.crate-failure-names { overflow-wrap: anywhere; }

.crate-list { margin: 0; padding: 0; list-style: none; }

.crate-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: 0.5rem;
  min-height: 44px;
  margin: 0;
  border-bottom: 1px solid var(--vp-c-divider);
}

.crate-name { overflow: hidden; font-size: 0.9rem; white-space: nowrap; text-overflow: ellipsis; }

.crate-bpm {
  display: inline-flex;
  align-items: baseline;
  min-height: 44px;
  align-content: center;
  padding-top: 0.6rem;
  font-size: 1rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-brand-1);
  text-decoration: none;
}
.crate-bpm small { margin-left: 0.2rem; font-size: 0.7rem; font-weight: 500; color: var(--vp-c-text-2); }
.crate-bpm:hover { text-decoration: underline; text-underline-offset: 3px; }

.crate-octave { font-size: 0.8rem; font-variant-numeric: tabular-nums; color: var(--vp-c-text-2); }

.crate-remove {
  min-width: 44px;
  min-height: 44px;
  border: 0;
  background: none;
  font-size: 1.1rem;
  color: var(--vp-c-text-2);
  cursor: pointer;
}
.crate-remove:hover { color: var(--vp-c-text-1); }

.crate-empty { padding: 0.75rem 0; font-size: 0.85rem; color: var(--vp-c-text-2); }

.crate-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }

.crate-btn {
  min-height: 44px;
  padding: 0 1rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  background: var(--vp-c-bg);
  font: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--vp-c-text-1);
  cursor: pointer;
}
.crate-btn:hover:not(:disabled) { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); }
.crate-btn:disabled { cursor: default; color: var(--vp-c-text-3); }

.crate-link {
  min-height: 44px;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}
.crate-link:hover { color: var(--vp-c-text-1); }
.crate-more { align-self: flex-start; color: var(--vp-c-brand-1); }
.crate-clear { margin-left: auto; }

.crate-btn:focus-visible, .crate-link:focus-visible, .crate-remove:focus-visible, .crate-bpm:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}
</style>
