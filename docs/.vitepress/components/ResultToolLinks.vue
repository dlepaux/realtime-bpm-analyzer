<script setup lang="ts">
import { computed } from 'vue'
import { useAnalytics } from '../composables/useAnalytics'
import { noteMs } from '../tools/tempo'
import { framesPerBeat } from '../tools/frames'

// The next step after a detected tempo: the beat length right away, then the
// tools, each opened already set to it (they read `?bpm=`). Deliberately a
// line of text, not buttons, so it never competes with the result's actions.
// `source` names the analyzer mode in analytics. `video` (the /video-bpm page) adds
// the beat in frames at 24 fps, the most common editing rate, and leads with frames.
const props = defineProps<{ bpm: number; source: 'file' | 'mic' | 'stream'; video?: boolean }>()

const { track } = useAnalytics()

const beatMs = computed(() => Math.round(noteMs(props.bpm, 4)))

const beatFrames = computed(() => Number(framesPerBeat(props.bpm, 24).toFixed(2)))

const AUDIO_LINKS = [
  { tool: 'bpm-to-ms', label: 'Delay times' },
  { tool: 'metronome', label: 'Metronome' },
] as const
const VIDEO_LINKS = [{ tool: 'bpm-to-frames', label: 'Frames at every fps' }] as const
const links = computed(() => (props.video ? VIDEO_LINKS : AUDIO_LINKS))

function onClick(tool: string) {
  track('bpm_tool_link_clicked', { bpm: props.bpm, mode: `${props.source}→${tool}` })
}
</script>

<template>
  <p class="result-tools">
    <span>1 beat = {{ beatMs }} ms<template v-if="video"> = {{ beatFrames }} frames at 24 fps</template></span>
    <!-- One unit, so a narrow card breaks between the value and the links. -->
    <span class="result-links">
      <a
        v-for="link in links"
        :key="link.tool"
        class="result-tool"
        :href="`/${link.tool}?bpm=${bpm}`"
        @click="onClick(link.tool)"
      >{{ link.label }}&nbsp;→</a>
    </span>
  </p>
</template>

<style scoped>
.result-tools {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.2rem 1rem;
  margin: 0.35rem 0 0;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-2);
}

.result-links {
  display: inline-flex;
  gap: 1rem;
}

.result-tool {
  font-weight: 500;
  color: var(--vp-c-brand-1);
  text-decoration: none;
}

.result-tool:hover { text-decoration: underline; text-underline-offset: 3px; }

.result-tool:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
  border-radius: 4px;
}
</style>
