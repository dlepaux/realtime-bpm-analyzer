// The editor's frame rate, remembered across the video tools: the rate last used on
// /bpm-to-frames or in the beat-marker export is the one the result card counts frames at and
// the export opens on next time. An editor works at one rate per project, and the tools used to
// assume 24 after every visit. No Vue and no DOM, so node --test runs it
// (scripts/frame-rate-memory.test.ts).
//
// The store holds an export timecode id ("25", "29.97 DF", "29.97 NDF"), the one list that names
// both the rate and, at 29.97 and 59.94, the timecode kind. Only the presets are remembered: a
// custom rate typed on /bpm-to-frames can't be exported, so it stays a one-off.
import { EXPORT_TIMECODES, type ExportTimecode } from './beat-markers.ts'
import { readItem, writeItem, type KeyValueStore } from './local-store.ts'

export const FRAME_RATE_STORAGE_KEY = 'rba:frame-rate:v1'

/** The rate when none is remembered: 24 fps, the most common editing rate. */
export const DEFAULT_TIMECODE: ExportTimecode = EXPORT_TIMECODES.find((entry) => entry.id === '24')!

/** The remembered timecode for a stored id, or 24 fps for anything that isn't one. */
export function parseRememberedRate(raw: string | null): ExportTimecode {
  return EXPORT_TIMECODES.find((entry) => entry.id === raw) ?? DEFAULT_TIMECODE
}

/**
 * What to remember when the editor uses a rate by its label (a row of /bpm-to-frames): the
 * current choice when it is that rate already, so a remembered 29.97 NDF stays non-drop, else the
 * rate's first timecode (drop-frame at 29.97 and 59.94, the broadcast norm). Null for a label
 * that isn't a preset.
 */
export function rateForLabel(current: ExportTimecode, label: string): ExportTimecode | null {
  if (current.rate.label === label) return current
  return EXPORT_TIMECODES.find((entry) => entry.rate.label === label) ?? null
}

export function loadFrameRate(store: KeyValueStore | null): ExportTimecode {
  return parseRememberedRate(readItem(store, FRAME_RATE_STORAGE_KEY))
}

export function saveFrameRate(store: KeyValueStore | null, timecode: ExportTimecode): boolean {
  return writeItem(store, FRAME_RATE_STORAGE_KEY, timecode.id)
}
