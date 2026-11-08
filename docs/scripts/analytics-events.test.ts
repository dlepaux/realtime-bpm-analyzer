// Run with `npm test`. The analytics catalogue against GA4's own rules (RBA-154): a name or value
// GA4 rejects, renames or reads as something else is lost without an error, so it fails here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEPRECATED_REMOVE_AFTER, EVENTS, PARAMS, type EventSpec, type ParamSpec } from '../.vitepress/tools/analytics-events.ts'

const events = Object.entries(EVENTS) as [string, EventSpec][]
const params = Object.entries(PARAMS) as [string, ParamSpec][]

// GA4: a letter first, then letters, digits and underscores, 40 at most.
const GA4_NAME = /^[a-z][a-z0-9_]{0,39}$/
// Read by GA4 as traffic-source fields, or kept for Google's own use.
const RESERVED_PARAMS = new Set(['source', 'medium', 'campaign', 'term', 'content'])
const RESERVED_PREFIXES = ['ga_', 'google_', 'firebase_']
// Names GA4 collects itself; sending one by hand counts it twice or is dropped.
const RESERVED_EVENTS = new Set([
  'ad_activeview', 'ad_click', 'ad_exposure', 'ad_query', 'ad_reward', 'adunit_exposure', 'app_clear_data',
  'app_exception', 'app_install', 'app_remove', 'app_store_refund', 'app_update', 'app_upgrade', 'error',
  'first_open', 'first_visit', 'in_app_purchase', 'notification_dismiss', 'notification_foreground',
  'notification_open', 'notification_receive', 'os_update', 'page_view', 'screen_view', 'session_start',
  'user_engagement', 'click', 'scroll', 'file_download', 'form_start', 'form_submit', 'view_search_results',
  'video_start', 'video_progress', 'video_complete',
])
// The standard (free) property's custom definitions: 50 event-scoped dimensions, 50 metrics.
const GA4_QUOTA = 50
const MAX_PARAMS_PER_EVENT = 25
const MAX_VALUE_LENGTH = 100

const reserved = (name: string) => RESERVED_PARAMS.has(name) || RESERVED_PREFIXES.some((prefix) => name.startsWith(prefix))

test('event names follow GA4 naming and avoid its reserved names', () => {
  assert.ok(events.length > 0)
  for (const [name] of events) {
    assert.match(name, GA4_NAME, name)
    assert.ok(!RESERVED_EVENTS.has(name), `${name} is collected by GA4 itself`)
    assert.ok(!RESERVED_PREFIXES.some((prefix) => name.startsWith(prefix)), `${name} uses a reserved prefix`)
  }
})

test('param names follow GA4 naming and avoid the reserved ones', () => {
  for (const [name] of params) {
    assert.match(name, GA4_NAME, name)
    assert.ok(!reserved(name), `${name} is reserved: GA4 reads it as something else`)
  }
})

test('the checks above catch the names that broke reports before', () => {
  // `source` sent as a param credited sessions to "drop" and "browse" (plan: rba-analytics-contract).
  assert.ok(reserved('source'))
  assert.ok(reserved('ga_session') && reserved('google_x') && reserved('firebase_y'))
  assert.doesNotMatch('Bpm_event', GA4_NAME)
  assert.doesNotMatch('a'.repeat(41), GA4_NAME)
})

test('every event carries at most 25 params, all declared in PARAMS', () => {
  for (const [name, spec] of events) {
    const keys = Object.keys(spec.params)
    assert.ok(keys.length <= MAX_PARAMS_PER_EVENT, `${name} has ${keys.length} params`)
    for (const key of keys) assert.ok(Object.hasOwn(PARAMS, key), `${name}.${key} is not in PARAMS`)
  }
})

test('enum values and text lengths fit in GA4\'s 100 characters, and no enum is empty or repeats', () => {
  for (const [name, spec] of params) {
    if (spec.type === 'enum') {
      assert.ok(spec.values.length > 0, name)
      assert.equal(new Set(spec.values).size, spec.values.length, `${name} repeats a value`)
      for (const value of spec.values) {
        assert.ok(value.length > 0 && value.length <= MAX_VALUE_LENGTH, `${name}: ${JSON.stringify(value)}`)
        assert.notEqual(value, 'invalid', `${name}: "invalid" is what the gate sends for a value outside the list`)
      }
    }
    if (spec.type === 'text') assert.ok(spec.maxLength <= MAX_VALUE_LENGTH, name)
    if (spec.type === 'int') assert.ok(Number.isInteger(spec.min) && Number.isInteger(spec.max) && spec.min <= spec.max, name)
  }
})

test('the dimensions and metrics to register fit the standard GA4 quota', () => {
  const count = (scope: string) => params.filter(([, spec]) => spec.scope === scope).length
  assert.ok(count('dimension') <= GA4_QUOTA, `${count('dimension')} dimensions`)
  assert.ok(count('metric') <= GA4_QUOTA, `${count('metric')} metrics`)
  // A number registered as a dimension splits reports into one row per value.
  for (const [name, spec] of params) {
    if (spec.type === 'int') assert.notEqual(spec.scope, 'dimension', `${name} is a number`)
  }
})

test('every param is used by at least one event', () => {
  const used = new Set(events.flatMap(([, spec]) => Object.keys(spec.params)))
  for (const [name] of params) assert.ok(used.has(name), `${name} is declared but no event carries it`)
})

test('every event says in a sentence what it tells Google, and when it repeats', () => {
  for (const [name, spec] of events) {
    assert.match(spec.privacy, /^[A-Z].{10,}\.$/, `${name}: privacy sentence`)
    assert.match(spec.repeats, /^[A-Z].*\.$/, `${name}: repeats note`)
    // The page that prints these must never promise more than the site does (privacy-wording.test.ts).
    assert.doesNotMatch(spec.privacy, /https?:|www\./, name)
  }
})

test('deprecated params are ones the event still sends, each with its replacement', () => {
  assert.match(DEPRECATED_REMOVE_AFTER, /^\d{4}-\d{2}-\d{2}$/)
  for (const [name, spec] of events) {
    for (const [key, replacement] of Object.entries(spec.deprecated ?? {})) {
      assert.ok(Object.hasOwn(spec.params, key), `${name}.${key} is deprecated but not sent`)
      for (const word of String(replacement).split(' and ')) {
        assert.ok(Object.hasOwn(spec.params, word), `${name}.${key}: its replacement ${word} is not on the event`)
      }
    }
  }
})

// Continuity for the RBA-153 and RBA-66 readbacks: these names were live before RBA-154 and are
// read across the cut-over. Renaming or dropping one breaks the series.
test('every event and param that existed before RBA-154 is still there', () => {
  const before = [
    'bpm_tab_change', 'bpm_file_selected', 'bpm_file_result', 'bpm_file_error', 'bpm_file_restart', 'bpm_mic_clicked',
    'bpm_mic_stable', 'bpm_mic_error', 'bpm_mic_stopped', 'bpm_stream_clicked', 'bpm_stream_stable', 'bpm_stream_error',
    'bpm_stream_stopped', 'bpm_stream_muted', 'bpm_stream_unmuted', 'bpm_link_detected', 'bpm_tab_capture_started',
    'bpm_tab_capture_failed', 'bpm_tap_measured', 'bpm_delay_copied', 'bpm_frames_copied', 'bpm_metronome_started',
    'bpm_tool_link_clicked', 'bpm_markers_exported', 'github_star_clicked', 'extension_uninstall_reason',
    'extension_link_clicked', 'extension_demo_control',
  ]
  for (const name of before) assert.ok(Object.hasOwn(EVENTS, name), name)
  const paramsBefore: Record<string, string[]> = {
    bpm_tab_change: ['mode'],
    bpm_file_selected: ['input_method', 'size_kb', 'extension'],
    bpm_file_result: ['input_method', 'bpm', 'duration_s', 'elapsed_ms'],
    bpm_file_error: ['input_method', 'error_kind', 'extension', 'reason'],
    bpm_mic_clicked: ['input_method'],
    bpm_mic_stable: ['bpm'],
    bpm_mic_error: ['reason'],
    bpm_stream_clicked: ['station', 'scheme', 'format'],
    bpm_stream_stable: ['bpm', 'station', 'scheme', 'format', 'input_method'],
    bpm_stream_error: ['station', 'scheme', 'format', 'reason', 'error_kind'],
    bpm_link_detected: ['platform'],
    bpm_tab_capture_failed: ['reason'],
    bpm_tap_measured: ['bpm', 'mode'],
    bpm_delay_copied: ['bpm', 'mode'],
    bpm_frames_copied: ['bpm', 'mode'],
    bpm_metronome_started: ['bpm', 'mode'],
    bpm_tool_link_clicked: ['bpm', 'mode'],
    bpm_markers_exported: ['format', 'frame_rate'],
    github_star_clicked: ['variant', 'placement'],
    extension_uninstall_reason: ['reason', 'extension_version'],
    extension_link_clicked: ['placement', 'target', 'store'],
    extension_demo_control: ['action'],
  }
  for (const [name, keys] of Object.entries(paramsBefore)) {
    const declared = (EVENTS as Record<string, EventSpec>)[name]!.params
    for (const key of keys) assert.ok(Object.hasOwn(declared, key), `${name}.${key}`)
  }
})
