<script setup lang="ts">
import { computed } from 'vue'
import { Star } from 'lucide-vue-next'
import { useAnalytics } from '../composables/useAnalytics'

// ── Props ──────────────────────────────────────────────────────────────────
// `variant` controls layout density:
//   - 'block'  → framed callout with heading + sub copy + button + count.
//                Stand-alone use (footer, end of guide page).
//   - 'inline' → button + count only. Used inside other components where the
//                surrounding context already provides framing copy.
//
// `placement` is a free-form string passed by the parent (e.g. 'demo-file-result',
// 'footer', 'getting-started-end'). It rides the analytics event payload so
// we can later attribute conversions to specific surfaces.
const props = withDefaults(defineProps<{
  variant?: 'inline' | 'block'
  placement: string
}>(), {
  variant: 'block',
})

const { track } = useAnalytics()

const REPO_URL = 'https://github.com/dlepaux/realtime-bpm-analyzer'

// `__GITHUB_STAR_COUNT__` is a Vite build-time `define` — a literal `number`
// or `null` baked into the bundle by `.vitepress/config.ts`. Null means the
// build-time GitHub API call failed; we degrade to no count rather than
// breaking the build or hammering the API at runtime.
const starCount: number | null = __GITHUB_STAR_COUNT__

// Locale-formatted count (e.g. 1234 → "1,234") for display. Falls back to
// `null` when the build-time fetch failed; consumers must handle the null.
const formattedCount = computed<string | null>(() => {
  if (starCount === null) return null
  return new Intl.NumberFormat('en').format(starCount)
})

// "1 star" vs "1,234 stars" — visible on the block variant. Tiny detail
// but "1 stars" reads broken.
const countLabel = computed<string | null>(() => {
  if (starCount === null || formattedCount.value === null) return null
  return `${formattedCount.value} ${starCount === 1 ? 'star' : 'stars'}`
})

function onClick() {
  track('github_star_clicked', {
    variant: props.variant,
    placement: props.placement,
  })
  // Default navigation proceeds — the anchor opens the repo in a new tab.
}
</script>

<template>
  <!-- BLOCK variant: framed callout, used as a stand-alone page section. -->
  <section
    v-if="variant === 'block'"
    class="gh-star gh-star--block"
    :aria-label="`Support Realtime BPM Analyzer on GitHub${countLabel ? ` (${countLabel})` : ''}`"
  >
    <div class="gh-star__heading">
      Found this useful?
    </div>
    <div class="gh-star__sub">
      Support the project on GitHub
    </div>
    <div class="gh-star__cta">
      <a
        :href="REPO_URL"
        target="_blank"
        rel="noopener noreferrer"
        class="gh-star__button"
        @click="onClick"
      >
        <Star
          :size="18"
          :stroke-width="2"
          fill="currentColor"
          aria-hidden="true"
        />
        <span>Star on GitHub</span>
      </a>
      <span
        v-if="countLabel"
        class="gh-star__count"
        aria-hidden="true"
      >{{ countLabel }}</span>
    </div>
  </section>

  <!-- INLINE variant: button + count only. Parent supplies framing. -->
  <div
    v-else
    class="gh-star gh-star--inline"
  >
    <a
      :href="REPO_URL"
      target="_blank"
      rel="noopener noreferrer"
      class="gh-star__button"
      :aria-label="`Star Realtime BPM Analyzer on GitHub${countLabel ? ` (${countLabel})` : ''}`"
      @click="onClick"
    >
      <Star
        :size="16"
        :stroke-width="2"
        fill="currentColor"
        aria-hidden="true"
      />
      <span>Star on GitHub</span>
      <span
        v-if="formattedCount"
        class="gh-star__count gh-star__count--inline"
        aria-hidden="true"
      >{{ formattedCount }}</span>
    </a>
  </div>
</template>

<style scoped>
/* All colors come from VitePress brand tokens so light/dark mode flips for
   free. `color-mix` for tinted backgrounds — same pattern used in
   BpmHeroTool's `.bpm-stable-pill`. */

.gh-star {
  font-family: inherit;
}

/* ── Block variant ───────────────────────────────────────────────────────── */
.gh-star--block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1.5rem 1.25rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  text-align: center;
}

.gh-star__heading {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
  letter-spacing: -0.01em;
}

.gh-star__sub {
  font-size: 0.9rem;
  color: var(--vp-c-text-2);
  margin-bottom: 0.4rem;
}

.gh-star__cta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: center;
}

/* ── Button (shared by both variants) ────────────────────────────────────── */
/* Solid brand-tinted pill. Background uses `color-mix` so it sits cleanly on
   any surface (default page bg, soft callout bg, dark mode). Hover lifts the
   tint; focus uses the standard VitePress focus ring color. */
.gh-star__button {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.5rem 0.95rem;
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1;
  color: var(--vp-c-brand-1);
  background: color-mix(in srgb, var(--vp-c-brand-1) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--vp-c-brand-1) 30%, transparent);
  border-radius: 999px;
  text-decoration: none;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.gh-star__button:hover {
  background: color-mix(in srgb, var(--vp-c-brand-1) 18%, transparent);
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 50%, transparent);
}

.gh-star__button:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

/* ── Count text ──────────────────────────────────────────────────────────── */
.gh-star__count {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--vp-c-text-2);
  font-variant-numeric: tabular-nums;
}

/* When the count sits inside the inline button, it's separated from the label
   by a thin divider rule so it reads as a paired badge rather than another
   word in the label. */
.gh-star__count--inline {
  padding-left: 0.55rem;
  margin-left: 0.1rem;
  border-left: 1px solid color-mix(in srgb, var(--vp-c-brand-1) 30%, transparent);
  color: var(--vp-c-brand-1);
  opacity: 0.85;
}

/* ── Inline variant ──────────────────────────────────────────────────────── */
.gh-star--inline {
  display: inline-flex;
}
</style>
