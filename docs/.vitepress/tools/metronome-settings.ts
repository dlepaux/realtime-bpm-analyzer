// The metronome's remembered settings (RBA-276): tempo, beats per bar and subdivision, kept in
// localStorage and in the address, so a returning player starts where they left off and a
// teacher's link opens on the meter as well as the tempo. The URL and the store hold the same
// query text (`bpm=72&beats=3&sub=triplets`), so one reader validates both. No Vue and no DOM,
// so node --test runs it (scripts/metronome-settings.test.ts).
import { coalescedWrite, type CoalescedWrite, type Timers } from './coalesced-write.ts'
import { writeItem, type KeyValueStore } from './local-store.ts'
import { parseBpmParam, writeSearchToUrl, type UrlWindow } from './tempo.ts'

export const METRONOME_STORAGE_KEY = 'rba:metronome:v1'

export const MIN_BEATS_PER_BAR = 1
export const MAX_BEATS_PER_BAR = 12

// `id` is what analytics sends (RBA-154), and what the address and the store hold; `label` is
// what the button shows; `value` is the clicks per beat.
export const SUBDIVISIONS = [
  { value: 1, label: 'Quarters', id: 'quarters' },
  { value: 2, label: 'Eighths', id: 'eighths' },
  { value: 3, label: 'Triplets', id: 'triplets' },
  { value: 4, label: '16ths', id: 'sixteenths' },
] as const

export type Subdivision = (typeof SUBDIVISIONS)[number]
export type SubdivisionId = Subdivision['id']

export interface MetronomeSettings {
  /** A whole tempo, MIN_BPM to MAX_BPM. */
  readonly bpm: number
  readonly beatsPerBar: number
  readonly subdivision: SubdivisionId
}

export const DEFAULT_SETTINGS: MetronomeSettings = { bpm: 120, beatsPerBar: 4, subdivision: 'quarters' }

/** The subdivision that plays `value` clicks per beat, quarters for any other number. */
export function subdivisionOf(value: number): Subdivision {
  return SUBDIVISIONS.find((entry) => entry.value === value) ?? SUBDIVISIONS[0]
}

/** The clicks per beat of a subdivision id. */
export function subdivisionValue(id: SubdivisionId): number {
  return (SUBDIVISIONS.find((entry) => entry.id === id) ?? SUBDIVISIONS[0]).value
}

// The tempo keeps the ?bpm= contract every tool page shares: clamped into range, so a link with
// 500 opens at 300, as it did before the meter joined it. The metronome steps in whole BPM.
function parseTempo(raw: string | null): number | null {
  const bpm = parseBpmParam(raw)
  return bpm === null ? null : Math.round(bpm)
}

// A bar has no nearest valid length the player could have meant, so out of range is refused.
function parseBeats(raw: string | null): number | null {
  if (raw === null || !/^\d{1,2}$/.test(raw)) return null
  const beats = Number(raw)
  return beats >= MIN_BEATS_PER_BAR && beats <= MAX_BEATS_PER_BAR ? beats : null
}

function parseSubdivision(raw: string | null): SubdivisionId | null {
  return SUBDIVISIONS.find((entry) => entry.id === raw)?.id ?? null
}

/**
 * The settings a query string holds, field by field: a field that is missing or invalid is left
 * out, so the next source fills it. The store's text is user-editable, so it goes through here too.
 */
export function readSettings(query: string | null): Partial<MetronomeSettings> {
  const params = new URLSearchParams(query ?? '')
  const bpm = parseTempo(params.get('bpm'))
  const beatsPerBar = parseBeats(params.get('beats'))
  const subdivision = parseSubdivision(params.get('sub'))
  return {
    ...(bpm === null ? {} : { bpm }),
    ...(beatsPerBar === null ? {} : { beatsPerBar }),
    ...(subdivision === null ? {} : { subdivision }),
  }
}

/** True when both hold the same settings. */
export function sameSettings(a: MetronomeSettings, b: MetronomeSettings): boolean {
  return a.bpm === b.bpm && a.beatsPerBar === b.beatsPerBar && a.subdivision === b.subdivision
}

/** What the metronome opens on: each field from the address, else the store, else the default. */
export function loadSettings(search: string, stored: string | null): MetronomeSettings {
  return { ...DEFAULT_SETTINGS, ...readSettings(stored), ...readSettings(search) }
}

/** The settings as the store holds them, the same text as in the address. */
export function settingsQuery(settings: MetronomeSettings): string {
  return withSettingsParams('', settings).slice(1)
}

/** The page's query with the settings set, other params (a campaign tag) kept. */
export function withSettingsParams(search: string, settings: MetronomeSettings): string {
  const params = new URLSearchParams(search)
  params.set('bpm', String(settings.bpm))
  params.set('beats', String(settings.beatsPerBar))
  params.set('sub', settings.subdivision)
  return `?${params.toString()}`
}

/** Puts the settings in the address without a Back step. False when the browser refused. */
export function writeSettingsToUrl(win: UrlWindow, settings: MetronomeSettings): boolean {
  return writeSearchToUrl(win, withSettingsParams(win.location.search, settings))
}

/** A change waits at most this long before it is saved; see coalescedWrite. */
export const SAVE_SPELL_MS = 400

/**
 * Saves the metronome's settings as they change: to the store and, while the page is still the
 * metronome, to the address. The address check matters because the router pushes the next
 * page's address before the metronome unmounts (and Back has changed it before popstate), so a
 * late write, a flush on leaving included, would put the tempo on the next page, which reads it.
 * A flush while the tab hides on the metronome writes both, so the address never lags the store.
 */
export function metronomeSaver(
  win: UrlWindow,
  store: KeyValueStore | null,
  timers: Timers,
  current: () => MetronomeSettings,
): CoalescedWrite {
  const path = win.location.pathname
  const save = () => {
    writeItem(store, METRONOME_STORAGE_KEY, settingsQuery(current()))
    if (win.location.pathname === path) writeSettingsToUrl(win, current())
  }
  return coalescedWrite(save, SAVE_SPELL_MS, timers)
}
