<script setup lang="ts">
// The free tools, right under the analyzer (RBA-66). One CSS grid of 6 columns: each row's tiles
// share it evenly (3 then 2), so every row is full at every width, and a phone gets a list.
import { Clock, Film, Hand, Timer, Video } from 'lucide-vue-next'
import { useAnalytics } from '../composables/useAnalytics'
import { FREE_TOOL_ROWS, GRID_COLUMNS, type ToolIcon } from '../tools/tool-list'

const ICONS: Record<ToolIcon, typeof Hand> = { hand: Hand, timer: Timer, clock: Clock, video: Video, film: Film }

const tiles = FREE_TOOL_ROWS.flatMap((row) => row.map((tool) => ({ ...tool, id: tool.link.replace(/^\//, ''), span: GRID_COLUMNS / row.length })))

const { track } = useAnalytics()
// Its own event, not bpm_tool_link_clicked: that one has counted only the links under a result
// since before the RBA-153 readback, and adding home clicks to it would show as a step change.
// `tool` is the same param on both, so one report can still put them side by side (RBA-154).
const onClick = (tool: string) => track('bpm_home_tool_clicked', { tool })
</script>

<template>
  <nav
    class="home-tools"
    aria-label="Free tools"
  >
    <ul class="home-wrap home-tools-grid">
      <li
        v-for="tool in tiles"
        :key="tool.link"
        :class="`home-tool-span-${tool.span}`"
      >
        <a
          class="home-tool-tile"
          :href="tool.link"
          @click="onClick(tool.id)"
        >
          <component
            :is="ICONS[tool.icon]"
            class="home-tool-icon"
            :size="22"
            :stroke-width="1.75"
            aria-hidden="true"
          />
          <span class="home-tool-name">{{ tool.name }}</span>
          <span class="home-tool-line">{{ tool.line }}</span>
        </a>
      </li>
    </ul>
  </nav>
</template>
