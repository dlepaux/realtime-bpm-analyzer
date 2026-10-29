// Run with `npm test` (node --test, Node's own type stripping; no test framework).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  STATIONS,
  classifyTabCaptureError,
  detectPlatform,
  diagnoseStreamFailure,
  streamEventParams,
  supportsTabAudio,
  type ProbeFetch,
} from '../.vitepress/tools/stream-input.ts'
import { isUrlShaped } from '../.vitepress/tools/analytics-params.ts'

test('detectPlatform: YouTube in every shape people paste', () => {
  for (const link of [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'http://youtube.com/watch?v=dQw4w9WgXcQ',
    'youtube.com/watch?v=dQw4w9WgXcQ',
    'www.youtube.com/watch?v=dQw4w9WgXcQ',
    'm.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?si=abc',
    'youtu.be/dQw4w9WgXcQ',
    'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/abc',
    '  https://WWW.YouTube.com/watch?v=x  ',
    'listen to this: https://youtu.be/x',
    // Pasted onto the end of the prefilled example URL.
    'https://ice1.somafm.com/defcon-128-mp3https://youtu.be/dQw4w9WgXcQ',
  ]) {
    assert.equal(detectPlatform(link), 'youtube', link)
  }
})

test('detectPlatform: the other platforms', () => {
  assert.equal(detectPlatform('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'), 'spotify')
  assert.equal(detectPlatform('spotify.link/abc'), 'spotify')
  assert.equal(detectPlatform('https://spoti.fi/abc'), 'spotify')
  assert.equal(detectPlatform('spotify:track:4uLU6hMCjMI75M1A2tKUQC'), 'spotify')
  assert.equal(detectPlatform('https://soundcloud.app.goo.gl/abc'), 'soundcloud')
  assert.equal(detectPlatform('https://apple.co/abc'), 'apple_music')
  assert.equal(detectPlatform('https://soundcloud.com/artist/track'), 'soundcloud')
  assert.equal(detectPlatform('m.soundcloud.com/artist/track'), 'soundcloud')
  assert.equal(detectPlatform('https://on.soundcloud.com/abc'), 'soundcloud')
  assert.equal(detectPlatform('https://music.apple.com/fr/album/x/123?i=456'), 'apple_music')
  assert.equal(detectPlatform('https://www.deezer.com/track/123'), 'deezer')
  assert.equal(detectPlatform('https://link.deezer.com/s/abc'), 'deezer')
  assert.equal(detectPlatform('https://artist.bandcamp.com/track/song'), 'bandcamp')
})

test('detectPlatform: stream URLs and look-alikes are not platforms', () => {
  for (const input of [
    '',
    '   ',
    'https://ice1.somafm.com/defcon-128-mp3',
    'https://stream.radioparadise.com/mp3-128',
    'https://notyoutube.com/watch?v=x',
    'https://youtube.com.evil.example/watch',
    'https://example.com/?u=youtube.com',
    // A platform URL as a query value belongs to the stream URL.
    'https://stream.example.com/live?ref=https://youtube.com/watch?v=x',
    'https://stream.example.com/live?a=1&ref=https%3A%2F%2Fyoutu.be%2Fx',
    'https://www.apple.com/music/',
    'ftp://youtube.com/x',
    'not a url',
  ]) {
    assert.equal(detectPlatform(input), null, input)
  }
})

// A fake fetch answering per mode: an object resolves, an Error rejects.
function fakeFetch(answers: Record<'cors' | 'no-cors', { ok: boolean; type: string } | Error>): ProbeFetch & { calls: string[] } {
  const calls: string[] = []
  const fn = async (_url: string, init: { mode: 'cors' | 'no-cors' }) => {
    calls.push(init.mode)
    const answer = answers[init.mode]
    if (answer instanceof Error) throw answer
    return answer
  }
  return Object.assign(fn, { calls })
}

const blocked = new TypeError('Failed to fetch')
const opaque = { ok: false, type: 'opaque' }

test('diagnoseStreamFailure: CORS answers OK, so the bytes did not decode', async () => {
  const fetchFn = fakeFetch({ cors: { ok: true, type: 'cors' }, 'no-cors': opaque })
  assert.equal(await diagnoseStreamFailure('https://a.example/s', 'https:', fetchFn), 'decode')
  assert.deepEqual(fetchFn.calls, ['cors'])
})

test('diagnoseStreamFailure: CORS answers non-OK is an HTTP error', async () => {
  const fetchFn = fakeFetch({ cors: { ok: false, type: 'cors' }, 'no-cors': opaque })
  assert.equal(await diagnoseStreamFailure('https://a.example/404', 'https:', fetchFn), 'http')
})

test('diagnoseStreamFailure: CORS blocked but the server is reachable is cors', async () => {
  const fetchFn = fakeFetch({ cors: blocked, 'no-cors': opaque })
  assert.equal(await diagnoseStreamFailure('https://a.example/s', 'https:', fetchFn), 'cors')
  assert.deepEqual(fetchFn.calls, ['cors', 'no-cors'])
})

test('diagnoseStreamFailure: both requests failing is network', async () => {
  const fetchFn = fakeFetch({ cors: blocked, 'no-cors': blocked })
  assert.equal(await diagnoseStreamFailure('https://a.invalid/s', 'https:', fetchFn), 'network')
})

test('diagnoseStreamFailure: http:// on an https page is insecure, without any request', async () => {
  const fetchFn = fakeFetch({ cors: blocked, 'no-cors': blocked })
  assert.equal(await diagnoseStreamFailure('http://stream.radioparadise.com/mp3-128', 'https:', fetchFn), 'insecure')
  assert.deepEqual(fetchFn.calls, [])
  // On a plain-http dev server the same URL is probed normally.
  assert.equal(await diagnoseStreamFailure('http://a.example/s', 'http:', fetchFn), 'network')
})

test('diagnoseStreamFailure: a hanging server times out as network', async () => {
  const hang: ProbeFetch = (_url, { signal }) =>
    new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))
  assert.equal(await diagnoseStreamFailure('https://a.example/s', 'https:', hang, 10), 'network')
})

const brands = (...names: string[]) => names.map(brand => ({ brand }))
const withPicker = { getDisplayMedia: () => undefined }

test('supportsTabAudio: desktop Chrome and Edge only', () => {
  assert.equal(supportsTabAudio({ mediaDevices: withPicker, userAgentData: { mobile: false, brands: brands('Chromium', 'Google Chrome') } }), true)
  assert.equal(supportsTabAudio({ mediaDevices: withPicker, userAgentData: { mobile: false, brands: brands('Chromium', 'Microsoft Edge') } }), true)
  // Android Chrome: no picker for tabs.
  assert.equal(supportsTabAudio({ mediaDevices: withPicker, userAgentData: { mobile: true, brands: brands('Chromium') } }), false)
  // Firefox and Safari: getDisplayMedia without userAgentData.
  assert.equal(supportsTabAudio({ mediaDevices: withPicker }), false)
  // iOS and old browsers: no getDisplayMedia.
  assert.equal(supportsTabAudio({ mediaDevices: {}, userAgentData: { mobile: false, brands: brands('Chromium') } }), false)
  assert.equal(supportsTabAudio(undefined), false)
})

test('classifyTabCaptureError: cancelling the picker is not an error', () => {
  assert.equal(classifyTabCaptureError(new DOMException('Permission denied', 'NotAllowedError')), 'cancelled')
  assert.equal(classifyTabCaptureError(new DOMException('', 'AbortError')), 'cancelled')
  assert.equal(classifyTabCaptureError(new DOMException('', 'NotSupportedError')), 'unsupported')
  assert.equal(classifyTabCaptureError(new Error('boom')), 'error')
  assert.equal(classifyTabCaptureError('weird'), 'error')
})

test('STATIONS: https only, so the https site can play them', () => {
  assert.ok(STATIONS.length > 0)
  for (const { url } of STATIONS) assert.match(url, /^https:\/\//)
})

test('streamEventParams: a curated station sends its id, scheme and format', () => {
  assert.deepEqual(streamEventParams('https://ice1.somafm.com/defcon-128-mp3'),
    { station: 'somafm_defcon', scheme: 'https', format: 'mp3' })
  assert.deepEqual(streamEventParams(' https://stream.radioparadise.com/mp3-128/?x=1 '),
    { station: 'radio_paradise', scheme: 'https', format: 'mp3' })
  assert.equal(new Set(STATIONS.map(s => s.id)).size, STATIONS.length)
  for (const s of STATIONS) assert.equal(streamEventParams(s.url).station, s.id)
})

test('streamEventParams: anything else is custom, with what the path tells about the codec', () => {
  assert.deepEqual(streamEventParams('http://radio.example.org:8000/live.aac'),
    { station: 'custom', scheme: 'http', format: 'aac' })
  assert.deepEqual(streamEventParams('https://ice1.somafm.com/defcon-256-ogg'),
    { station: 'custom', scheme: 'https', format: 'ogg' })
  assert.deepEqual(streamEventParams('https://cdn.example.com/u/secret-token-1234/stream'),
    { station: 'custom', scheme: 'https', format: 'unknown' })
  assert.deepEqual(streamEventParams('not a url'), { station: 'custom', scheme: 'other', format: 'unknown' })
  assert.deepEqual(streamEventParams('ftp://files.example.com/a.mp3'),
    { station: 'custom', scheme: 'other', format: 'mp3' })
})

test('streamEventParams: no value is URL-shaped or carries a piece of the address', () => {
  const urls = [
    ...STATIONS.map(s => s.url),
    'https://user:pass@private.example.com/mounts/token-abc123/live.mp3?key=zzz#frag',
    'http://192.168.1.20:8000/stream',
    'https://radio.example.org/live.m3u8',
  ]
  for (const url of urls) {
    for (const value of Object.values(streamEventParams(url))) {
      assert.equal(isUrlShaped(value), false, `${url} → ${value}`)
      assert.match(value, /^[a-z\d_]+$/, `${url} → ${value}`)
      assert.ok(!['private', 'token', 'abc123', 'example', '192'].some(part => value.includes(part)), value)
    }
  }
})
