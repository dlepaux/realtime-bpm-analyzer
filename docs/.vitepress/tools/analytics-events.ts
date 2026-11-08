// Every analytics event the website sends and every param it may carry (RBA-154). This file is
// the contract: track() is typed from it and drops or marks anything it doesn't declare, the
// tests check its names against GA4's rules and every call site against it, and the website
// privacy page prints its privacy sentences. A new event or param starts here, and nowhere else
// needs editing for it to reach GA4.
//
// Readback continuity (RBA-153, RBA-66): no `bpm_*` event is renamed or removed and no param
// changes meaning before the day-14 read. Split params ride beside the ones they replace, which
// are marked `deprecated` and go after DEPRECATED_REMOVE_AFTER.
//
// Pure data: it imports other pure tool modules for their value lists, never Vue, so node --test
// reads it as it is.

import { KNOWN_FILE_EXTENSIONS } from './analytics-params.ts'
import { EXPORT_TIMECODES, MARKER_FORMATS } from './beat-markers.ts'
import { UNINSTALL_REASONS } from './extension-pages.ts'
import { EXTENSION_PLACEMENTS } from './extension-promo.ts'
import { FRAME_RATES } from './frames.ts'
import { MIC_ERROR_KINDS, MIC_ERROR_NAMES } from './mic-error.ts'
import { PLATFORM_LABELS, STATIONS, STREAM_ERROR_MESSAGES } from './stream-input.ts'
import { NOTE_DIVISIONS } from './tempo.ts'
import { freeTools } from './tool-list.ts'

/**
 * Where a param shows in GA4 once registered under Admin › Custom definitions: an event-scoped
 * dimension, a metric, or `none` (kept in the BigQuery export only).
 */
export type GaScope = 'dimension' | 'metric' | 'none'

export type ParamSpec =
  | { readonly type: 'enum'; readonly values: readonly string[]; readonly scope: GaScope }
  | { readonly type: 'int'; readonly min: number; readonly max: number; readonly scope: GaScope }
  | { readonly type: 'bool'; readonly scope: GaScope }
  /** Existing params only: text with a shape, cut to GA4's 100 characters. No new free text. */
  | { readonly type: 'text'; readonly maxLength: number; readonly pattern?: RegExp; readonly scope: GaScope }

/** Sent in place of an enum value the catalogue doesn't list, so the drift shows in reports. */
export const INVALID = 'invalid'

/** When the deprecated params below may go: after the RBA-66 day-14 read. */
export const DEPRECATED_REMOVE_AFTER = '2026-11-22'

const NOTE_FEELS = ['straight', 'dotted', 'triplet'] as const
const BEATS_PER_BAR = Array.from({ length: 12 }, (_, index) => index + 1)
const TOOL_IDS = freeTools().map((tool) => tool.link.replace(/^\//, ''))

export const PARAMS = {
  // ── Existing params (meaning unchanged) ──────────────────────────────────────────────────
  /** Six meanings, one per event, kept for continuity. Each has a split param beside it now. */
  mode: { type: 'text', maxLength: 100, pattern: /^[\w ./→-]+$/u, scope: 'dimension' },
  input_method: {
    type: 'enum',
    values: ['drop', 'browse', 'mic_tab', 'link_fallback', 'tab', 'url'],
    scope: 'dimension',
  },
  size_kb: { type: 'int', min: 0, max: 10_000_000, scope: 'metric' },
  extension: { type: 'enum', values: [...KNOWN_FILE_EXTENSIONS, 'other'], scope: 'dimension' },
  bpm: { type: 'int', min: 0, max: 1000, scope: 'metric' },
  duration_s: { type: 'int', min: 0, max: 86_400, scope: 'metric' },
  elapsed_ms: { type: 'int', min: 0, max: 3_600_000, scope: 'metric' },
  error_kind: {
    type: 'enum',
    values: ['decode_failed', 'no_bpm', ...Object.keys(STREAM_ERROR_MESSAGES), ...MIC_ERROR_KINDS],
    scope: 'dimension',
  },
  /** The browser's error message (URL-scrubbed), or a fixed reason on the events that have one. */
  reason: { type: 'text', maxLength: 100, scope: 'dimension' },
  platform: { type: 'enum', values: Object.keys(PLATFORM_LABELS), scope: 'dimension' },
  station: { type: 'enum', values: [...STATIONS.map((station) => station.id), 'custom'], scope: 'dimension' },
  scheme: { type: 'enum', values: ['http', 'https', 'other'], scope: 'dimension' },
  /** A stream's codec, or a marker file's format: two meanings, so markers also send export_format. */
  format: {
    type: 'enum',
    values: ['mp3', 'aac', 'ogg', 'opus', 'flac', 'unknown', ...MARKER_FORMATS.map((entry) => entry.id)],
    scope: 'dimension',
  },
  frame_rate: { type: 'enum', values: EXPORT_TIMECODES.map((entry) => entry.id), scope: 'dimension' },
  variant: { type: 'enum', values: ['inline', 'block'], scope: 'dimension' },
  placement: {
    type: 'enum',
    values: [...EXTENSION_PLACEMENTS, 'demo_file_result', 'demo_mic_stable', 'demo_stream_stable', 'getting_started_end'],
    scope: 'dimension',
  },
  target: { type: 'enum', values: ['page', 'store', 'share'], scope: 'dimension' },
  store: { type: 'enum', values: ['chrome', 'edge'], scope: 'dimension' },
  extension_version: { type: 'text', maxLength: 23, pattern: /^\d{1,5}(\.\d{1,5}){0,3}$/, scope: 'dimension' },
  action: { type: 'enum', values: ['replay', 'pause'], scope: 'dimension' },

  // ── Added by RBA-154 ─────────────────────────────────────────────────────────────────────
  result_source: { type: 'enum', values: ['file', 'mic', 'stream', 'home_grid'], scope: 'dimension' },
  tool: { type: 'enum', values: TOOL_IDS, scope: 'dimension' },
  error_name: { type: 'enum', values: MIC_ERROR_NAMES, scope: 'dimension' },
  tap_count: { type: 'int', min: 0, max: 100_000, scope: 'metric' },
  time_signature: { type: 'enum', values: BEATS_PER_BAR.map((beats) => `${beats}/4`), scope: 'dimension' },
  subdivision: { type: 'enum', values: ['quarters', 'eighths', 'triplets', 'sixteenths'], scope: 'dimension' },
  note_value: {
    type: 'enum',
    values: NOTE_DIVISIONS.flatMap((division) => NOTE_FEELS.map((feel) => `1/${division} ${feel}`)),
    scope: 'dimension',
  },
  unit: { type: 'enum', values: ['ms', 'hz'], scope: 'dimension' },
  fps: { type: 'enum', values: [...FRAME_RATES.map((rate) => rate.label), 'custom'], scope: 'dimension' },
  frame_cell: { type: 'enum', values: ['beat', 'bar'], scope: 'dimension' },
  export_format: { type: 'enum', values: MARKER_FORMATS.map((entry) => entry.id), scope: 'dimension' },
  first: { type: 'bool', scope: 'dimension' },
} as const satisfies Record<string, ParamSpec>

export type ParamName = keyof typeof PARAMS

export type EventSpec = {
  /** Each param the event may carry: `required` on every send, `optional` on some. */
  readonly params: { readonly [P in ParamName]?: 'required' | 'optional' }
  /** When it fires again, so a report reads rates per session rather than raw counts. */
  readonly repeats: string
  /** What it tells Google, in the words the website privacy page prints. */
  readonly privacy: string
  /** Params kept for continuity, each with what replaces it. Removed after DEPRECATED_REMOVE_AFTER. */
  readonly deprecated?: { readonly [P in ParamName]?: string }
}

const STREAM_URL_PARAMS = { station: 'optional', scheme: 'optional', format: 'optional' } as const

export const EVENTS = {
  bpm_tab_change: {
    params: { mode: 'required' },
    repeats: 'On every switch between the analyzer tabs.',
    privacy: 'Which tab of the analyzer you switch to: File, Mic or Stream.',
  },
  bpm_file_selected: {
    params: { input_method: 'required', size_kb: 'required', extension: 'required' },
    repeats: 'Once per file chosen.',
    privacy: 'When you choose a file to analyse: whether you dropped it or browsed for it, its size and its extension, never its name or content.',
  },
  bpm_file_result: {
    params: { input_method: 'required', bpm: 'required', duration_s: 'required', elapsed_ms: 'required' },
    repeats: 'Once per analysed file.',
    privacy: 'When a file is analysed: the tempo found, the length of the file and how long the analysis took.',
  },
  bpm_file_error: {
    params: { input_method: 'required', error_kind: 'required', extension: 'required', reason: 'required' },
    repeats: 'Once per failed file.',
    privacy: "When a file can't be analysed: the kind of error, the file's extension and the browser's error message, with any web address in it removed.",
  },
  bpm_file_restart: {
    params: {},
    repeats: 'Each time a file result is cleared.',
    privacy: 'When you clear a file result to start again.',
  },
  bpm_mic_clicked: {
    params: { input_method: 'required' },
    repeats: 'Each time the microphone is started.',
    privacy: 'When you start the microphone, from its tab or from the alternatives offered for a link.',
  },
  bpm_mic_stable: {
    params: { bpm: 'required', first: 'required', elapsed_ms: 'optional' },
    repeats: 'When a steady tempo is found, then again only when it changes.',
    privacy: 'When the microphone finds a steady tempo: the tempo, whether it is the first one since you started, and for the first one the time it took.',
  },
  bpm_mic_error: {
    params: { reason: 'required', error_kind: 'required', error_name: 'required' },
    repeats: 'Once per failed start.',
    privacy: "When the microphone can't start: whether access was denied, no microphone was found or it was in use, the browser's error name, and its error message with any web address in it removed.",
    deprecated: { reason: 'error_kind and error_name' },
  },
  bpm_mic_stopped: {
    params: {},
    repeats: 'Each time the microphone is stopped.',
    privacy: 'When you stop the microphone.',
  },
  bpm_stream_clicked: {
    params: { ...STREAM_URL_PARAMS, input_method: 'required' },
    repeats: 'Each time a stream is started.',
    privacy: 'When you start a stream: which listed station you picked, or that the stream is your own, with its scheme and audio format, never its address.',
  },
  bpm_stream_stable: {
    params: { ...STREAM_URL_PARAMS, input_method: 'required', bpm: 'required', first: 'required', elapsed_ms: 'optional' },
    repeats: 'When a steady tempo is found, then again only when it changes.',
    privacy: 'When a stream or a shared tab finds a steady tempo: the tempo, the station details above, whether it is the first one since you started, and for the first one the time it took.',
  },
  bpm_stream_error: {
    params: { ...STREAM_URL_PARAMS, input_method: 'required', error_kind: 'required', reason: 'required' },
    repeats: 'Once per failed stream.',
    privacy: "When a stream can't play: the station details above, the kind of error and the browser's error message, with any web address in it removed.",
  },
  bpm_stream_stopped: {
    params: {},
    repeats: 'Each time a stream or a shared tab is stopped.',
    privacy: 'When you stop a stream.',
  },
  bpm_stream_muted: {
    params: {},
    repeats: 'Each time the stream is muted.',
    privacy: 'When you mute a stream.',
  },
  bpm_stream_unmuted: {
    params: {},
    repeats: 'Each time the stream is unmuted.',
    privacy: 'When you unmute a stream.',
  },
  bpm_link_detected: {
    params: { platform: 'required' },
    repeats: 'Once per platform per page view.',
    privacy: 'When you paste a link from a platform such as YouTube: the name of the platform, never the link.',
  },
  bpm_tab_capture_started: {
    params: {},
    repeats: 'Each time tab sharing starts.',
    privacy: "When you start sharing a tab's sound.",
  },
  bpm_tab_capture_failed: {
    params: { reason: 'required' },
    repeats: 'Each time tab sharing fails or is cancelled.',
    privacy: 'When sharing a tab fails: whether you cancelled, the tab had no sound, the browser cannot share tab audio, or another error.',
  },
  bpm_tap_measured: {
    params: { bpm: 'required', mode: 'required', tap_count: 'required' },
    repeats: 'Once per finished tapping sequence.',
    privacy: 'When you tap a tempo on Tap Tempo: the tempo and the number of taps.',
    deprecated: { mode: 'tap_count' },
  },
  bpm_delay_copied: {
    params: { bpm: 'required', mode: 'required', note_value: 'required', unit: 'required' },
    repeats: 'Each time a value is copied.',
    privacy: 'When you copy a value on BPM to ms: the tempo, the note value and the unit.',
    deprecated: { mode: 'note_value and unit' },
  },
  bpm_frames_copied: {
    params: { bpm: 'required', mode: 'required', fps: 'required', frame_cell: 'required' },
    repeats: 'Each time a value is copied.',
    privacy: 'When you copy a value on BPM to Frames: the tempo, the frame rate (a rate you typed is sent as "custom") and whether it is a beat or a bar.',
    deprecated: { mode: 'fps and frame_cell' },
  },
  bpm_metronome_started: {
    params: { bpm: 'required', mode: 'required', time_signature: 'required', subdivision: 'required' },
    repeats: 'Each time the metronome starts.',
    privacy: 'When you start the metronome: the tempo, the time signature and the subdivision.',
    deprecated: { mode: 'time_signature and subdivision' },
  },
  bpm_tool_link_clicked: {
    params: { bpm: 'optional', mode: 'required', result_source: 'required', tool: 'required' },
    repeats: 'Each click.',
    privacy: 'When you open another tool from a result or from the home page: which tool, where the link was, and the tempo it carries over.',
    deprecated: { mode: 'result_source and tool' },
  },
  bpm_markers_exported: {
    params: { format: 'required', frame_rate: 'required', export_format: 'required' },
    repeats: 'Once per file result, on the first download.',
    privacy: 'When you download beat markers: the file format and the frame rate you picked, with drop-frame or non-drop, never the markers or the name of the file.',
    deprecated: { format: 'export_format' },
  },
  github_star_clicked: {
    params: { variant: 'required', placement: 'required' },
    repeats: 'Each click.',
    privacy: 'When you click the GitHub star button: where it sits and which layout it has.',
  },
  extension_uninstall_reason: {
    params: { reason: 'required', extension_version: 'optional' },
    repeats: 'At most once per visit to the goodbye page.',
    privacy: "When you pick a reason on the page the browser extension opens after its removal: that reason, from the list, and the extension's version. Nothing you type is sent.",
  },
  extension_link_clicked: {
    params: { placement: 'required', target: 'required', store: 'optional' },
    repeats: 'Each click.',
    privacy: 'When you click a link to the browser extension: where it sits on the site, whether it leads to its page, a store or the "send the link to yourself" option, and for a store which one (Chrome or Edge).',
  },
  extension_demo_control: {
    params: { action: 'required' },
    repeats: 'Each click.',
    privacy: "When you pause or replay the browser extension's demo.",
  },
} as const satisfies Record<string, EventSpec>

export type EventName = keyof typeof EVENTS

// ── Types for track() ────────────────────────────────────────────────────────────────────────

type ValueOf<S> = S extends { type: 'enum'; values: readonly (infer V)[] }
  ? V
  : S extends { type: 'int' }
    ? number
    : S extends { type: 'bool' }
      ? boolean
      : string

type ParamsDeclared<E extends EventName> = (typeof EVENTS)[E]['params']
type RequiredKeys<E extends EventName> = {
  [K in keyof ParamsDeclared<E>]: ParamsDeclared<E>[K] extends 'required' ? K : never
}[keyof ParamsDeclared<E>]
type OptionalKeys<E extends EventName> = Exclude<keyof ParamsDeclared<E>, RequiredKeys<E>>

/** The params an event accepts, from the catalogue: required keys must be there, nothing else may. */
export type EventParamsOf<E extends EventName> = {
  [K in RequiredKeys<E> & ParamName]: ValueOf<(typeof PARAMS)[K]>
} & {
  [K in OptionalKeys<E> & ParamName]?: ValueOf<(typeof PARAMS)[K]>
}

/** The name alone for an event with no required param, the name and its params for the rest. */
export type TrackArgs<E extends EventName> = [RequiredKeys<E>] extends [never]
  ? [params?: EventParamsOf<E>]
  : [params: EventParamsOf<E>]
