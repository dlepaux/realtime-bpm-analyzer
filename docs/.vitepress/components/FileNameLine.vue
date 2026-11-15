<script setup lang="ts">
// A file's name on the home tool, on one line (RBA-116, round 2). Wrapped, a long name took three
// lines and grew the result 20 px past the hero's reserved height on phones, so it is cut in the
// middle instead, keeping its end and extension (tools/file-name.ts).
// - Screen readers hear the whole name, once, from a hidden copy; the cut line is hidden from them.
// - A cut name becomes a button: a tap or a click shows the whole name, wrapped, and another cuts
//   it again. A pointer also gets the whole name as a tooltip. Opening it grows the card, which
//   follows the visitor's own action, like opening the export.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { fileNameParts } from '../tools/file-name'

const props = defineProps<{ name: string }>()

const parts = computed(() => fileNameParts(props.name))
const root = ref<HTMLElement | null>(null)
const cut = ref(false)
const open = ref(false)
const control = computed(() => cut.value || open.value)

// Measured, not guessed from the length: whether a name fits depends on the font and the width.
// An open name wraps whole, so it is only measured cut.
function measure() {
  if (open.value) return
  const head = root.value?.querySelector<HTMLElement>('.file-name-head') ?? null
  cut.value = head !== null && head.scrollWidth > head.clientWidth
}

function toggle() {
  if (control.value) open.value = !open.value
}

let observer: ResizeObserver | null = null
onMounted(() => {
  measure()
  if (root.value === null) return
  observer = new ResizeObserver(measure)
  observer.observe(root.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div
    ref="root"
    class="file-name"
  >
    <component
      :is="control ? 'button' : 'p'"
      class="file-name-line"
      :class="{ 'is-control': control, 'is-open': open }"
      :type="control ? 'button' : undefined"
      :aria-expanded="control ? open : undefined"
      :title="control ? name : undefined"
      @click="toggle"
    >
      <span class="file-name-full">{{ name }}</span>
      <span
        class="file-name-visual"
        aria-hidden="true"
      ><span class="file-name-head">{{ parts.head }}</span><span class="file-name-tail">{{ parts.tail }}</span></span>
    </component>
  </div>
</template>

<style scoped>
.file-name {
  max-width: 100%;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--vp-c-text-2);
}

.file-name-line {
  display: block;
  max-width: 100%;
  margin: 0;
}

/* A button that reads as the name it is, with a dotted underline saying it opens. 24 px tall at
   least, the smallest target WCAG 2.5.8 allows. */
.file-name-line.is-control {
  min-height: 24px;
  padding: 0;
  border: 0;
  font: inherit;
  color: inherit;
  text-align: center;
  background: none;
  cursor: pointer;
}

.file-name-line.is-control .file-name-visual {
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}

.file-name-line.is-control:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
  border-radius: 4px;
}

/* For screen readers only: the whole name, read once. */
.file-name-full {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* One line: the head gives way first, with an ellipsis, and the tail stays whole. `pre` keeps a
   space at the cut, which a collapsing white-space would drop. */
.file-name-visual {
  display: flex;
  justify-content: center;
  max-width: 100%;
}

.file-name-head {
  min-width: 0;
  white-space: pre;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-name-tail {
  white-space: pre;
  flex-shrink: 0;
}

/* Open: the whole name, wrapped anywhere, since a name without a space can't wrap otherwise. */
.file-name-line.is-open .file-name-visual { display: block; }

.file-name-line.is-open .file-name-head,
.file-name-line.is-open .file-name-tail {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
