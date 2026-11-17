<script setup lang="ts">
// The home page's "Where it runs" section (RBA-266): a row of the platforms the library runs
// on, each linking to its guide, then one tab per language. The row shows names only, no logos
// (David, 2026-11-17, on RBA-266). index.md fills each tab's slot with the install line and the
// sample, copied from the guide, so the code renders at build time and
// scripts/home-platforms.test.ts can hold it to the guide. Self-contained, so the
// home page's rework (RBA-240) moves it in one piece.
//
// The tabs follow the WAI-ARIA tabs pattern: arrow keys, Home and End move between them and
// select the one they land on; Tab moves into the open panel. Every panel is in the HTML,
// the closed ones hidden, so the samples are read without JavaScript too.
import { ref } from 'vue'
import { LANGUAGE_TABS, PLATFORMS } from '../tools/platforms'

const selected = ref(0)
// By index, through a function ref: Vue doesn't promise a v-for ref array keeps the list's order.
const tabs: HTMLButtonElement[] = []

function setTab(element: unknown, index: number) {
  if (element instanceof HTMLButtonElement) {
    tabs[index] = element
  }
}

function select(index: number) {
  const count = LANGUAGE_TABS.length
  selected.value = (index + count) % count
  const tab = tabs[selected.value]
  tab?.focus()
  // On a phone the strip can scroll sideways: keep the chosen tab in sight.
  tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

const KEY_MOVES: Readonly<Record<string, (index: number) => number>> = {
  ArrowRight: (index) => index + 1,
  ArrowLeft: (index) => index - 1,
  Home: () => 0,
  End: () => LANGUAGE_TABS.length - 1,
}

function onKeydown(event: KeyboardEvent, index: number) {
  const move = KEY_MOVES[event.key]
  if (move === undefined) {
    return
  }
  event.preventDefault()
  select(move(index))
}
</script>

<template>
  <div class="home-platforms">
    <p
      id="home-platforms-runs-in"
      class="home-platforms-label"
    >
      Runs in
    </p>
    <ul
      class="home-platforms-row"
      aria-labelledby="home-platforms-runs-in"
    >
      <li
        v-for="platform in PLATFORMS"
        :key="platform.name"
      >
        <a
          :href="platform.guide"
          class="home-platforms-item"
        >{{ platform.name }}</a>
      </li>
    </ul>

    <div
      class="home-platforms-tabs"
      role="tablist"
      aria-label="Languages"
    >
      <button
        v-for="(tab, index) in LANGUAGE_TABS"
        :id="`home-platforms-tab-${tab.id}`"
        :key="tab.id"
        :ref="(element) => setTab(element, index)"
        type="button"
        role="tab"
        class="home-platforms-tab"
        :aria-selected="index === selected"
        :aria-controls="`home-platforms-panel-${tab.id}`"
        :tabindex="index === selected ? 0 : -1"
        @click="select(index)"
        @keydown="onKeydown($event, index)"
      >
        {{ tab.label }}
      </button>
    </div>

    <div
      v-for="(tab, index) in LANGUAGE_TABS"
      :id="`home-platforms-panel-${tab.id}`"
      :key="tab.id"
      role="tabpanel"
      class="home-platforms-panel"
      :aria-labelledby="`home-platforms-tab-${tab.id}`"
      :hidden="index !== selected"
      tabindex="0"
    >
      <slot :name="tab.id" />
      <p class="home-platforms-guide">
        <a :href="tab.guide">Read {{ tab.guideTitle }}</a>
      </p>
    </div>
  </div>
</template>

<style scoped>
.home-platforms-label {
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--vp-c-text-2);
}

.home-platforms-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  margin: 0.5rem 0 1.5rem;
  padding: 0;
  list-style: none;
}

.vp-doc .home-platforms-row li { margin: 0; }

.vp-doc .home-platforms-item {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  font-weight: 600;
  color: var(--vp-c-text-2);
  text-decoration: none;
  transition: color 0.2s;
}

.vp-doc .home-platforms-item:hover { color: var(--vp-c-text-1); }

.home-platforms-tabs {
  display: flex;
  overflow-x: auto;
  border-bottom: 1px solid var(--vp-c-divider);
}

.home-platforms-tab {
  flex: none;
  min-height: 44px;
  padding: 0 0.6rem;
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--vp-c-text-2);
  transition: color 0.2s, box-shadow 0.2s;
}

.home-platforms-tab:hover { color: var(--vp-c-text-1); }

/* Five tabs fit a 390px phone at the tighter padding; wider screens get more room. */
@media (min-width: 640px) {
  .home-platforms-tab { padding: 0 1rem; }
}

.home-platforms-tab[aria-selected='true'] {
  /* An inset underline: the strip scrolls sideways, so it clips anything drawn outside a tab. */
  box-shadow: inset 0 -2px 0 var(--vp-c-brand-1);
  color: var(--vp-c-text-1);
}

.home-platforms-panel:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

/* Inside the tab, for the same clipping. */
.home-platforms-tab:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: -2px;
}

.home-platforms-panel { padding-top: 0.5rem; }

.home-platforms-guide { font-weight: 500; }
</style>
