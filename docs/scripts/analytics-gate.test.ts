// Run with `npm test`. The runtime gate behind track() (RBA-154).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gateEvent } from '../.vitepress/tools/analytics-gate.ts'
import { REDACTED } from '../.vitepress/tools/analytics-params.ts'
import { classifyMicError } from '../.vitepress/tools/mic-error.ts'

test('a clean event passes as it is, with no problem', () => {
  assert.deepEqual(gateEvent('bpm_link_detected', { platform: 'youtube' }), { params: { platform: 'youtube' }, problems: [] })
  assert.deepEqual(gateEvent('bpm_file_restart'), { params: {}, problems: [] })
})

test('an undeclared key is dropped and reported', () => {
  const { params, problems } = gateEvent('bpm_link_detected', { platform: 'youtube', url: 'x', mode: 'mic' })
  assert.deepEqual(params, { platform: 'youtube' })
  assert.equal(problems.length, 2)
  assert.match(problems[0]!, /url: not declared/)
})

test('a value outside an enum is sent as "invalid"', () => {
  const { params, problems } = gateEvent('extension_link_clicked', { placement: 'somewhere-new', target: 'page' })
  assert.deepEqual(params, { placement: 'invalid', target: 'page' })
  assert.equal(problems.length, 1)
})

test('an int is rounded and clamped to its range, and a non-number is dropped', () => {
  assert.deepEqual(gateEvent('bpm_tap_measured', { bpm: 5000, mode: '4 taps', tap_count: -3 }).params, { bpm: 1000, mode: '4 taps', tap_count: 0 })
  assert.deepEqual(gateEvent('bpm_tap_measured', { bpm: 120.4, mode: '4 taps', tap_count: 4 }).params, { bpm: 120, mode: '4 taps', tap_count: 4 })
  const { params, problems } = gateEvent('bpm_tap_measured', { bpm: Number.NaN, mode: '4 taps', tap_count: 4 })
  assert.deepEqual(params, { mode: '4 taps', tap_count: 4 })
  assert.ok(problems.some((line) => /bpm: NaN|bpm: null/.test(line)))
  assert.ok(problems.some((line) => /bpm: required, missing/.test(line)))
})

test('a required param that is missing is reported, an optional one is not', () => {
  assert.deepEqual(gateEvent('extension_link_clicked', { placement: 'goodbye' }).problems, ['extension_link_clicked.target: required, missing'])
  assert.deepEqual(gateEvent('extension_link_clicked', { placement: 'goodbye', target: 'page' }).problems, [])
})

test('a boolean must be a boolean, and an undefined value counts as absent', () => {
  assert.deepEqual(gateEvent('bpm_mic_stable', { bpm: 120, first: true, elapsed_ms: undefined }), { params: { bpm: 120, first: true }, problems: [] })
  assert.ok(gateEvent('bpm_mic_stable', { bpm: 120, first: 'yes' }).problems.length > 0)
})

test('text is cut to its length, and a shaped text outside its shape is "invalid"', () => {
  const long = 'x'.repeat(300)
  assert.equal(String(gateEvent('bpm_mic_error', { reason: long, error_kind: 'other', error_name: 'other' }).params.reason).length, 100)
  assert.equal(gateEvent('extension_uninstall_reason', { reason: 'other', extension_version: '1.0.1; drop' }).params.extension_version, 'invalid')
})

test('an unknown event sends nothing', () => {
  assert.deepEqual(gateEvent('bpm_something_new', { bpm: 1 }), { params: {}, problems: ['bpm_something_new: not in the catalogue'] })
})

test('scrubEventParams still applies: a URL inside an error message never leaves', () => {
  const { params, problems } = gateEvent('bpm_mic_error', {
    reason: 'Failed to load https://radio.example.com/private?token=abc',
    error_kind: 'other',
    error_name: 'other',
  })
  assert.equal(params.reason, REDACTED)
  assert.deepEqual(problems, [])
})

test('an address past the length cut is still redacted: the scrub reads the whole text first', () => {
  const reason = `${'a'.repeat(80)} at icecast.example.org/live`
  assert.equal(gateEvent('bpm_stream_error', { input_method: 'url', error_kind: 'network', reason }).params.reason, REDACTED)
})

test('classifyMicError: the kind and the name, never the message', () => {
  const named = (name: string) => Object.assign(new Error('some text with https://x.example/'), { name })
  assert.deepEqual(classifyMicError(named('NotAllowedError')), { error_kind: 'denied', error_name: 'NotAllowedError' })
  assert.deepEqual(classifyMicError(named('NotFoundError')), { error_kind: 'no_device', error_name: 'NotFoundError' })
  assert.deepEqual(classifyMicError(named('NotReadableError')), { error_kind: 'in_use', error_name: 'NotReadableError' })
  assert.deepEqual(classifyMicError(named('SecurityError')), { error_kind: 'other', error_name: 'SecurityError' })
  assert.deepEqual(classifyMicError(named('SomethingNew')), { error_kind: 'other', error_name: 'other' })
  assert.deepEqual(classifyMicError('a string'), { error_kind: 'other', error_name: 'other' })
  assert.deepEqual(classifyMicError(new DOMException('no', 'NotAllowedError')), { error_kind: 'denied', error_name: 'NotAllowedError' })
})

test('every mic error kind and name is in the catalogue', () => {
  for (const name of ['NotAllowedError', 'NotFoundError', 'NotReadableError', 'SomethingNew']) {
    const error = Object.assign(new Error(''), { name })
    assert.deepEqual(gateEvent('bpm_mic_error', { reason: 'r', ...classifyMicError(error) }).problems, [], name)
  }
})
