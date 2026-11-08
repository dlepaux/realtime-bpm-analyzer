<script setup lang="ts">
// The analyzer's tempo readout (RBA-66): one large number, a chip saying whether a live reading
// is still settling or stable, the beat dot while audio comes in, and at most one alternate
// reading. The rules live in tools/tempo-readout.ts. Screen readers hear the parent's live
// region, not this, so a live number changing every second is never read out.
import { computed } from 'vue'
import { alternateReading, beatPeriodMs } from '../tools/tempo-readout'

const props = defineProps<{
  bpm: number | null
  /** 'final' for a whole file. A live source is 'settling' until its reading is stable. */
  state: 'final' | 'settling' | 'stable'
  /** Audio is coming in, so the dot follows the beat. */
  listening?: boolean
}>()

const CHIP_LABEL = { settling: 'Settling', stable: 'Stable' } as const

// Offered once a reading is settled: an alternate for a number still moving would move with it.
const alternate = computed(() => (props.bpm !== null && props.state !== 'settling' ? alternateReading(props.bpm) : null))
const period = computed(() => (props.listening && props.bpm !== null ? beatPeriodMs(props.bpm) : null))
const formatBpm = (bpm: number) => (Number.isInteger(bpm) ? String(bpm) : bpm.toFixed(1))
</script>

<template>
  <div class="bpm-readout">
    <span
      v-if="state !== 'final'"
      class="bpm-chip"
      :data-state="state"
    >
      <span
        class="bpm-chip-dot"
        :class="{ 'is-beating': period !== null }"
        :style="period !== null ? { '--beat-period': `${period}ms` } : undefined"
        aria-hidden="true"
      />
      {{ CHIP_LABEL[state] }}
    </span>
    <p class="bpm-readout-value">
      <span class="bpm-readout-number">{{ bpm ?? '···' }}</span>
      <span class="bpm-readout-unit">BPM</span>
    </p>
    <p
      v-if="alternate"
      class="bpm-readout-alternate"
    >
      {{ alternate.kind === 'double' ? 'Double time' : 'Half time' }}: <span class="bpm-readout-tabular">{{ formatBpm(alternate.bpm) }}</span> BPM
    </p>
  </div>
</template>

<style scoped>
.bpm-readout {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.bpm-readout-value {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.5rem;
  margin: 0;
  line-height: 1;
}

.bpm-readout-number {
  font-size: 4.5rem;
  font-weight: 700;
  letter-spacing: -0.04em;
  color: var(--vp-c-text-1);
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.bpm-readout-unit {
  font-size: 1rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
}

.bpm-readout-alternate {
  margin: 0;
  font-size: 0.9375rem;
  color: var(--vp-c-text-2);
}

.bpm-readout-tabular { font-variant-numeric: tabular-nums; }

/* The extension pill's state colours: white on its deep fill, its bright mark for the dot. */
.bpm-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.3rem 0.75rem 0.3rem 0.6rem;
  border-radius: 999px;
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.2;
  color: var(--rba-tempo-ink);
  background: var(--rba-tempo-settling-fill);
}

.bpm-chip[data-state='stable'] { background: var(--rba-tempo-stable-fill); }

.bpm-chip-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--rba-tempo-settling);
}

.bpm-chip[data-state='stable'] .bpm-chip-dot { background: var(--rba-tempo-stable); }

/* The beat: a shrink and fade once per period, never a flash of light (WCAG 2.3.1). The period is
   one beat, or several above 170 BPM, so it stays under three a second. */
@media (prefers-reduced-motion: no-preference) {
  .bpm-chip-dot.is-beating { animation: bpm-beat var(--beat-period) ease-out infinite; }
}

@keyframes bpm-beat {
  0% { transform: scale(1); opacity: 1; }
  60%, 100% { transform: scale(0.55); opacity: 0.5; }
}

@media (min-width: 640px) {
  .bpm-readout-number { font-size: 6rem; }
}
</style>
