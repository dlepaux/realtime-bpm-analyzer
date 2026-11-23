<script setup lang="ts">
// "Open the toolbox": the door from a www page into the app's copy of it. It renders on
// the home and the free tools' pages, and nowhere else (tools/toolbox-entry.ts). Every placement is
// in the prerendered HTML at its final size, so nothing moves when the page hydrates, and none sits
// above a tool: on a phone the first screen stays the tool's, so the bar entry shows from
// tablet width up, and phones get it at the top of the menu and under the tool.
import { computed } from 'vue'
import { useData, useRoute } from 'vitepress'
import { ArrowRight } from 'lucide-vue-next'
import { useAnalytics } from '../composables/useAnalytics'
import { appUrlOf, type AppPlacement } from '../tools/toolbox-entry'

const props = defineProps<{ placement: AppPlacement }>()
const route = useRoute()
const { track } = useAnalytics()
const { page } = useData()
// The 404 page is prerendered at /404, so it never has an entry, whatever address shows it.
const href = computed(() => (page.value.isNotFound ? null : appUrlOf(route.path)))
</script>

<template>
  <p
    v-if="href && placement === 'app_below_tool'"
    class="toolbox-below"
  >
    <span class="toolbox-below-line">Every free tool in one app.</span>
    <a
      class="toolbox-entry is-below"
      :href="href"
      @click="track('app_link_clicked', { placement: props.placement })"
    >Open the toolbox<ArrowRight
      class="toolbox-entry-icon"
      aria-hidden="true"
    /></a>
  </p>
  <a
    v-else-if="href"
    class="toolbox-entry"
    :class="placement === 'app_nav' ? 'is-nav' : 'is-menu'"
    :href="href"
    @click="track('app_link_clicked', { placement: props.placement })"
  >Open the toolbox<ArrowRight
    class="toolbox-entry-icon"
    aria-hidden="true"
  /></a>
</template>

<style scoped>
.toolbox-entry {
  display: inline-flex;
  align-items: center;
  gap: 0.35em;
  border: 1.5px solid var(--rba-action);
  border-radius: 999px;
  background: var(--rba-action);
  color: #fff;
  font-weight: 600;
  line-height: 1.2;
  text-decoration: none;
  white-space: nowrap;
  transition: background-color 0.2s ease, border-color 0.2s ease;
}

.toolbox-entry:hover {
  border-color: var(--rba-action-hover);
  background: var(--rba-action-hover);
  color: #fff;
}

.toolbox-entry:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.toolbox-entry-icon {
  width: 1em;
  height: 1em;
  flex: none;
}

/* The bar is VitePress's, which turns pointer events off on its frame and on for its children.
   The pill looks 30px tall; its ::after makes the tap area 44px without making the bar busier. */
.toolbox-entry.is-nav {
  display: none;
  position: relative;
  pointer-events: auto;
  margin-left: 16px;
  padding: 0.35rem 0.9rem;
  font-size: 0.875rem;
}

.toolbox-entry.is-nav::after {
  content: '';
  position: absolute;
  inset: -7px 0;
}

/* The theme keeps its menu button up to 959px (custom.css), so from 768px the bar's entry stands
   for the menu's. From 960px the full menu takes the bar, and the entry only fits again from
   1100px (measured); between the two, the row under the tool is the way in. */
@media (min-width: 768px) {
  .toolbox-entry.is-nav {
    display: inline-flex;
  }

  .toolbox-entry.is-menu {
    display: none;
  }
}

@media (min-width: 960px) and (max-width: 1099px) {
  .toolbox-entry.is-nav {
    display: none;
  }
}

.toolbox-entry.is-menu {
  justify-content: center;
  width: 100%;
  min-height: 48px;
  margin-bottom: 16px;
  padding: 0.6rem 1.2rem;
  font-size: 1rem;
}

.toolbox-below {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.5rem 1rem;
  margin: 1.5rem 0 0;
  text-align: center;
}

.toolbox-below-line {
  color: var(--vp-c-text-2);
}

.toolbox-entry.is-below {
  min-height: 44px;
  padding: 0.5rem 1.2rem;
  font-size: 1rem;
}
</style>
