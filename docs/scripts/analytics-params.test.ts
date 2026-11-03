// Run with `npm test` (node --test, Node's own type stripping; no test framework).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { REDACTED, fileExtensionParam, isUrlShaped, scrubEventParams } from '../.vitepress/tools/analytics-params.ts'

test('fileExtensionParam: keeps a known format, whatever its case', () => {
  assert.equal(fileExtensionParam('song.MP3'), 'mp3')
  assert.equal(fileExtensionParam('my.long.name.flac'), 'flac')
})

test('fileExtensionParam: never sends a piece of the name', () => {
  for (const name of ['My Secret Demo', 'Artist.Title', 'demo.', '.hidden', '']) {
    assert.equal(fileExtensionParam(name), 'other', name)
  }
})

test('isUrlShaped: catches the addresses people paste and browsers quote', () => {
  for (const value of [
    'https://ice1.somafm.com/defcon-128-mp3',
    'http://10.0.0.2:8000/private-mount',
    'Failed to load https://example.com/stream?token=abc',
    'icecast://radio.example.org/live',
    'blob:https://bpm.lepaux.com/1234',
    'data:audio/mpeg;base64,AAAA',
    'spotify:track:4uLU6hMCjMI75M1A2tKUQC',
    'www.example.com',
    'radio.example.org/live.mp3',
  ]) {
    assert.equal(isUrlShaped(value), true, value)
  }
})

test('isUrlShaped: leaves the values the site does send alone', () => {
  for (const value of [
    'custom', 'somafm_defcon', 'https', 'mp3', 'unknown', 'drop', 'tab', 'cors',
    'audio_error', 'No BPM candidate returned', 'The element has no supported sources.',
    'decode_failed', 'youtube', 'apple_music', 'NotAllowedError',
    '4/4 Triplets', 'stream→tap-tempo', '1/8 dotted ms', '12 taps',
  ]) {
    assert.equal(isUrlShaped(value), false, value)
  }
})

test('scrubEventParams: redacts only URL-shaped strings and keeps the rest', () => {
  assert.deepEqual(
    scrubEventParams({ station: 'custom', bpm: 128, muted: false, reason: 'GET https://x.example/a failed' }),
    { station: 'custom', bpm: 128, muted: false, reason: REDACTED },
  )
})
