// The editor's remembered frame rate as one value the video tools share (RBA-276), so a rate
// picked in the marker export shows at once in the result line above it. Read from the store on
// the first mount, never at import: the build prerenders the pages in Node, where module state
// is shared by every page and there is no store.

import { computed, onMounted, shallowRef } from 'vue'
import type { ExportTimecode } from '../tools/beat-markers'
import { DEFAULT_TIMECODE, loadFrameRate, saveFrameRate } from '../tools/frame-rate-memory'
import { browserStore } from '../tools/local-store'

// Shallow, so the value stays the EXPORT_TIMECODES entry itself and compares by identity.
const rate = shallowRef<ExportTimecode>(DEFAULT_TIMECODE)
const current = computed(() => rate.value)
let hydrated = false

function hydrate() {
  if (hydrated) return
  hydrated = true
  rate.value = loadFrameRate(browserStore())
}

/** The rate the editor last used: picking one updates every tool showing it, and the store. */
function pick(next: ExportTimecode) {
  hydrated = true
  if (next === rate.value) return
  rate.value = next
  saveFrameRate(browserStore(), next)
}

export function useFrameRate() {
  // Mounting only happens in the browser, so the prerender never reads or marks the store.
  onMounted(hydrate)
  return { rate: current, pick }
}
