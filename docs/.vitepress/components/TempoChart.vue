<script setup lang="ts">
import { computed } from 'vue'
import { useAnalytics } from '../composables/useAnalytics'
import { CHART_TOOLS, GENRE_TEMPOS, ITALIAN_TERMS, SOURCES, chartLink, formatRange, type ChartRow, type ChartTool } from '../tools/tempo-chart'

// One table of the tempo chart (RBA-209). Every row names its sources beside their figures and
// opens the metronome or BPM to ms at its tempo. Rendered on the server, so the prerendered page
// holds every row and source for readers and crawlers; only the click tracking needs the browser.
const props = defineProps<{ section: 'italian' | 'genre' }>()

const { track } = useAnalytics()

const rows = computed(() => (props.section === 'italian' ? ITALIAN_TERMS : GENRE_TEMPOS))
const nameHeading = computed(() => (props.section === 'italian' ? 'Term' : 'Genre'))
const meaningHeading = computed(() => (props.section === 'italian' ? 'Meaning' : 'Sound'))

function onClick(row: ChartRow, tool: ChartTool, bpm: number) {
  track('bpm_chart_link_clicked', { bpm, tool, chart_row: row.id })
}

// Each name starts with the link's visible text, so a voice command such as "click Play" finds it.
function label(row: ChartRow, tool: ChartTool, bpm: number): string {
  return tool === 'metronome' ? `Play ${row.name} at ${bpm} BPM on the metronome` : `Delay times for ${row.name} at ${bpm} BPM`
}

function halfLabel(row: ChartRow, bpm: number): string {
  return `${bpm}, ${row.name} in half time, on the metronome`
}

const caption = computed(() => (props.section === 'italian' ? 'Italian tempo terms in BPM' : 'Common tempos by genre in BPM'))
</script>

<template>
  <!-- Explicit roles: the phone layout makes rows grids, which can cost a table its semantics in WebKit. -->
  <table class="tc-table" role="table">
    <caption class="tc-hidden">{{ caption }}</caption>
    <thead role="rowgroup">
      <tr role="row">
        <th scope="col" role="columnheader">{{ nameHeading }}</th>
        <th scope="col" role="columnheader">{{ meaningHeading }}</th>
        <th scope="col" role="columnheader">BPM, by source</th>
        <th scope="col" role="columnheader" class="tc-num">Plays at</th>
        <th scope="col" role="columnheader" class="tc-actions"><span class="tc-hidden">Open at this tempo</span></th>
      </tr>
    </thead>
    <tbody role="rowgroup">
      <tr v-for="row in rows" :id="`tempo-${row.id}`" :key="row.id" role="row">
        <th scope="row" role="rowheader" class="tc-name">{{ row.name }}</th>
        <td role="cell" class="tc-meaning">{{ row.meaning }}</td>
        <td role="cell" class="tc-ranges">
          <ul>
            <li v-for="range in row.ranges" :key="range.source">
              <span class="tc-range">{{ formatRange(range) }}</span>
              <a class="tc-source" :href="`#source-${range.source}`">{{ SOURCES[range.source].short }}</a>
            </li>
          </ul>
        </td>
        <td role="cell" class="tc-num tc-play">
          <span class="tc-play-label">Plays at </span><strong>{{ row.play }}</strong>
          <span v-if="row.half" class="tc-half">feels like
            <a
              :href="chartLink('metronome', row.half)"
              :aria-label="halfLabel(row, row.half)"
              @click="onClick(row, 'metronome', row.half)"
            >{{ row.half }}</a>
          </span>
        </td>
        <td role="cell" class="tc-actions">
          <a
            v-for="link in CHART_TOOLS"
            :key="link.tool"
            class="tc-link"
            :href="chartLink(link.tool, row.play)"
            :aria-label="label(row, link.tool, row.play)"
            @click="onClick(row, link.tool, row.play)"
          >{{ link.label }}</a>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
/* `.vp-doc` tables scroll as a block; this one reflows instead, so a phone never scrolls sideways. */
.vp-doc .tc-table {
  display: table;
  width: 100%;
  margin: 1rem 0 1.5rem;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.vp-doc .tc-table th,
.vp-doc .tc-table td {
  padding: 0.55rem 0.6rem;
  border: none;
  border-bottom: 1px solid var(--vp-c-divider);
  vertical-align: top;
  text-align: left;
  background: none;
}

.vp-doc .tc-table tr { background: none; border: none; }
.vp-doc .tc-table thead th { font-size: 0.8rem; color: var(--vp-c-text-2); font-weight: 600; white-space: nowrap; }
.vp-doc .tc-name { font-weight: 650; white-space: nowrap; color: var(--vp-c-text-1); }
.tc-meaning { color: var(--vp-c-text-2); }
.vp-doc .tc-num { text-align: right; font-variant-numeric: tabular-nums; }
.tc-play strong { font-size: 1.05rem; }

.tc-half {
  display: block;
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
  white-space: nowrap;
}

.vp-doc .tc-ranges ul { margin: 0; padding: 0; list-style: none; }
.vp-doc .tc-ranges li { margin: 0; white-space: nowrap; font-variant-numeric: tabular-nums; }
.tc-range { display: inline-block; min-width: 7.5em; padding-right: 0.4em; }

.vp-doc .tc-source {
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
  text-decoration: none;
}

.vp-doc .tc-source:hover { color: var(--vp-c-brand-1); text-decoration: underline; }

.tc-actions { white-space: nowrap; }
.tc-play-label { display: none; }

.vp-doc .tc-link {
  display: inline-block;
  margin: 0 0 0.3rem 0.4rem;
  padding: 0.2rem 0.65rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  text-decoration: none;
  color: var(--vp-c-brand-1);
}

.vp-doc .tc-link:first-child { border-color: var(--vp-c-brand-1); }
.vp-doc .tc-link:hover { background: var(--vp-c-brand-soft); }

.vp-doc .tc-link:focus-visible,
.vp-doc .tc-source:focus-visible,
.vp-doc .tc-half a:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.tc-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* Phones: each row becomes a card, name and tempo on top, the links last. */
@media (max-width: 640px) {
  .vp-doc .tc-table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .vp-doc .tc-table tbody tr {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-areas:
      'name play'
      'meaning meaning'
      'ranges ranges'
      'actions actions';
    gap: 0.25rem 0.75rem;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--vp-c-divider);
  }
  .vp-doc .tc-table tbody th,
  .vp-doc .tc-table tbody td { padding: 0; border: none; }
  .tc-name { grid-area: name; }
  .tc-meaning { grid-area: meaning; }
  .tc-ranges { grid-area: ranges; }
  .tc-play { grid-area: play; }
  .tc-play-label { display: inline; font-size: 0.8rem; color: var(--vp-c-text-2); }
  .tc-actions { grid-area: actions; }
  .vp-doc .tc-link { margin: 0.25rem 0.5rem 0 0; padding: 0.35rem 0.9rem; font-size: 0.85rem; }
}

/* On paper the links do nothing: the chart prints as a plain table. */
@media print {
  .tc-actions { display: none; }
  .vp-doc .tc-table { font-size: 9.5pt; }
  .vp-doc .tc-table tr { break-inside: avoid; }
  .vp-doc .tc-source,
  .vp-doc .tc-half a { color: inherit; text-decoration: none; }
}
</style>
