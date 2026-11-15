<script setup lang="ts">
// The free tools, right under the analyzer (RBA-66), grouped by what a visitor came to do
// (RBA-240). One CSS grid of 12 columns per group: each group's tiles share its row evenly, so
// every row is full at every width, and a phone gets a list.
import { Clock, Film, Flag, Hand, Timer, Video, Zap } from 'lucide-vue-next'
import { useAnalytics } from '../composables/useAnalytics'
import { FREE_TOOL_GROUPS, GRID_COLUMNS, type ToolIcon } from '../tools/tool-list'

const ICONS: Record<ToolIcon, typeof Hand> = { hand: Hand, timer: Timer, clock: Clock, video: Video, film: Film, flag: Flag, zap: Zap }

const groups = FREE_TOOL_GROUPS.map((group, index) => ({
  title: group.title,
  headingId: `home-tools-group-${index + 1}`,
  tiles: group.tools.map((tool) => ({ ...tool, id: tool.link.replace(/^\//, ''), span: GRID_COLUMNS / group.tools.length })),
}))

const { track } = useAnalytics()
// Its own event, not bpm_tool_link_clicked: that one has counted only the links under a result
// since before the RBA-153 readback, and adding home clicks to it would show as a step change.
// `tool` is the same param on both, so one report can still put them side by side (RBA-154).
const onClick = (tool: string) => track('bpm_home_tool_clicked', { tool })
</script>

<template>
  <nav
    class="home-tools"
    aria-labelledby="home-tools-heading"
  >
    <div class="home-wrap">
      <h2
        id="home-tools-heading"
        class="home-tools-heading"
      >
        More free tools
      </h2>
      <section
        v-for="group in groups"
        :key="group.headingId"
        class="home-tool-group"
      >
        <h3
          :id="group.headingId"
          class="home-tool-group-title"
        >
          {{ group.title }}
        </h3>
        <ul
          class="home-tools-grid"
          :aria-labelledby="group.headingId"
        >
          <li
            v-for="tool in group.tiles"
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
      </section>
    </div>
  </nav>
</template>
