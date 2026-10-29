// Pure logic behind the hero tool's stream input: which links can never play
// here, why a stream failed, and whether this browser can share tab audio.
// No Vue and no DOM globals, so `npm test` runs it with plain `node --test`
// (scripts/stream-input.test.ts). Keep it that way: no imports, I/O injected.

export type Platform = 'youtube' | 'spotify' | 'soundcloud' | 'apple_music' | 'deezer' | 'bandcamp'

// A host matches a domain when it is the domain or one of its subdomains, so
// music.youtube.com, m.soundcloud.com and artist.bandcamp.com all land here.
const PLATFORM_DOMAINS: ReadonlyArray<readonly [Platform, readonly string[]]> = [
  ['youtube', ['youtube.com', 'youtu.be', 'youtube-nocookie.com']],
  ['spotify', ['spotify.com', 'spotify.link']],
  ['soundcloud', ['soundcloud.com', 'snd.sc']],
  ['apple_music', ['music.apple.com', 'itunes.apple.com']],
  ['deezer', ['deezer.com', 'deezer.page.link']],
  ['bandcamp', ['bandcamp.com']],
]

export const PLATFORM_LABELS: Record<Platform, string> = {
  youtube: 'YouTube',
  spotify: 'Spotify',
  soundcloud: 'SoundCloud',
  apple_music: 'Apple Music',
  deezer: 'Deezer',
  bandcamp: 'Bandcamp',
}

function hostOf(token: string): string | null {
  // Accept what people paste: with or without a scheme, `www.` or `m.`.
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(token) ? token : `https://${token}`
  try {
    const { protocol, hostname } = new URL(withScheme)
    if (protocol !== 'https:' && protocol !== 'http:') return null
    return hostname.toLowerCase().replace(/\.$/, '')
  } catch {
    return null
  }
}

/**
 * The streaming platform a pasted link points to, or null for anything else.
 * Checks every token split on whitespace and before each scheme, so both
 * "listen: https://youtu.be/x" and a link pasted onto the end of the prefilled
 * example URL ("…defcon-128-mp3https://youtu.be/x") count.
 */
export function detectPlatform(raw: string): Platform | null {
  for (const token of raw.trim().split(/\s+|(?=https?:\/\/)/i)) {
    const host = hostOf(token)
    if (!host) continue
    const match = PLATFORM_DOMAINS.find(([, domains]) =>
      domains.some(domain => host === domain || host.endsWith(`.${domain}`)),
    )
    if (match) return match[0]
  }
  return null
}

// ─── Stream failure classification ───────────────────────────────────────

export type StreamErrorKind = 'cors' | 'network' | 'decode' | 'http' | 'insecure'

export const STREAM_ERROR_MESSAGES: Record<StreamErrorKind, string> = {
  // A 404 without CORS headers looks the same to the browser, hence the second cause.
  cors: 'That server doesn’t let other sites read its audio (no CORS headers), or the address is wrong. Try a station below.',
  network: 'Couldn’t reach that stream. Check the address and your connection.',
  decode: 'The server answered, but your browser can’t play that as audio. Use a direct MP3 or AAC stream URL.',
  http: 'The server refused that stream. Check the address, or try a station below.',
  insecure: 'This page is secure, so the browser blocks http:// streams. Try the https:// address.',
}

/** The subset of `fetch` the probe needs, injected so tests run without a network. */
export type ProbeFetch = (url: string, init: { mode: 'cors' | 'no-cors'; signal: AbortSignal }) => Promise<{ ok: boolean; type: string }>

export const PROBE_TIMEOUT_MS = 5_000

/**
 * Asks why a stream that failed to play failed. The media element only says
 * "error", so the probe repeats the request with fetch:
 *  - a CORS GET that answers OK means the bytes arrived but didn't decode;
 *  - one that answers non-OK is an HTTP error (404, 403…);
 *  - one that throws is CORS or network: a no-cors GET that answers (opaque)
 *    proves the server is reachable, so CORS blocked the first.
 * GET, not HEAD: Icecast servers such as SomaFM don't list HEAD as allowed.
 * Each request is aborted once headers arrive, so a live stream isn't downloaded.
 */
export async function diagnoseStreamFailure(
  url: string,
  pageProtocol: string,
  fetchFn: ProbeFetch,
  timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<StreamErrorKind> {
  if (pageProtocol === 'https:' && /^http:\/\//i.test(url.trim())) return 'insecure'

  const attempt = async (mode: 'cors' | 'no-cors') => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetchFn(url, { mode, signal: controller.signal })
    } catch {
      return null
    } finally {
      clearTimeout(timer)
      controller.abort()
    }
  }

  const cors = await attempt('cors')
  if (cors) return cors.ok ? 'decode' : 'http'
  const opaque = await attempt('no-cors')
  return opaque ? 'cors' : 'network'
}

// ─── Tab audio capture ───────────────────────────────────────────────────

/** The parts of `navigator` that decide tab-audio support, so tests can fake them. */
export interface NavigatorLike {
  mediaDevices?: { getDisplayMedia?: unknown }
  userAgentData?: { mobile?: boolean; brands?: ReadonlyArray<{ brand: string }> }
}

/**
 * Tab audio through getDisplayMedia only works in desktop Chromium (Chrome,
 * Edge). Firefox and Safari share video but no tab audio, and mobile has no
 * picker. They don't expose userAgentData either, so its brands are the test.
 */
export function supportsTabAudio(nav: NavigatorLike | undefined): boolean {
  if (typeof nav?.mediaDevices?.getDisplayMedia !== 'function') return false
  const data = nav.userAgentData
  if (!data || data.mobile) return false
  return (data.brands ?? []).some(({ brand }) => brand === 'Chromium')
}

export type TabCaptureFailure = 'cancelled' | 'no_audio' | 'unsupported' | 'error'

/** Maps a getDisplayMedia rejection to the reason we report and act on. */
export function classifyTabCaptureError(error: unknown): TabCaptureFailure {
  const name = typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : ''
  // Chrome rejects with NotAllowedError both when the user cancels the picker
  // and when a policy blocks capture; cancelling is by far the common case.
  if (name === 'NotAllowedError' || name === 'AbortError') return 'cancelled'
  if (name === 'NotSupportedError' || name === 'TypeError') return 'unsupported'
  return 'error'
}

// ─── Curated stations ────────────────────────────────────────────────────

export interface Station {
  name: string
  url: string
}

// Each one checked live on 2026-10-29 to answer with Access-Control-Allow-Origin,
// which the analyser needs to read a cross-origin stream (RBA-4). Radio Paradise
// also serves http://, which this https page would block, so keep the https URL.
export const STATIONS: readonly Station[] = [
  { name: 'SomaFM DEF CON', url: 'https://ice1.somafm.com/defcon-128-mp3' },
  { name: 'Groove Salad', url: 'https://ice1.somafm.com/groovesalad-128-mp3' },
  { name: 'Beat Blender', url: 'https://ice2.somafm.com/beatblender-128-mp3' },
  { name: 'Radio Paradise', url: 'https://stream.radioparadise.com/mp3-128' },
]
