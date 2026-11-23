// Watches a live mic session for what the analyzer can't see (RBA-275): the AudioContext or the
// track stopping under it (a call, a notification, the screen locking, iOS taking the audio
// session), an input too quiet to read, and a reading that isn't coming. It also keeps the
// screen on while listening, which a phone held near a speaker otherwise turns off mid-reading.
//
// The rules are in tools/mic-guard.ts; this only listens and keeps the state. One session at a
// time: attach() replaces any previous one, detach() releases everything it took.

import { ref } from 'vue'
import { LEVEL_POLL_MS, isTooQuiet, nextQuietSince, offersTapAlong, rmsDbfs } from '../tools/mic-guard'

interface MicSession {
  context: AudioContext
  track: MediaStreamTrack | null
  analyser: AnalyserNode
  samples: Float32Array<ArrayBuffer>
  startedAt: number
  quietSince: number | null
  everLocked: boolean
  trackEnded: boolean
  timer: number
  wakeLock: WakeLockSentinel | null
  release: () => void
}

/** Safari reports 'interrupted' while another app holds the audio session; anything but running is a pause. */
const isRunning = (context: AudioContext) => context.state === 'running'

export function useMicGuard() {
  const paused = ref(false)
  const tooQuiet = ref(false)
  const offerTap = ref(false)
  /** Across the session, for bpm_mic_stopped: was it ever interrupted, was it ever too quiet. */
  const wasInterrupted = ref(false)
  const wasQuiet = ref(false)
  let session: MicSession | null = null

  function setPaused(next: boolean) {
    if (next) wasInterrupted.value = true
    paused.value = next
  }

  function refreshPaused() {
    if (!session) return
    const muted = session.track?.muted ?? false
    setPaused(session.trackEnded || muted || !isRunning(session.context))
  }

  function tick() {
    if (!session || paused.value) return
    const now = performance.now()
    session.analyser.getFloatTimeDomainData(session.samples)
    session.quietSince = nextQuietSince(session.quietSince, rmsDbfs(session.samples), now)
    tooQuiet.value = isTooQuiet(session.quietSince, now)
    if (tooQuiet.value) wasQuiet.value = true
    offerTap.value = offersTapAlong(session.startedAt, now, session.everLocked)
  }

  // A wake lock is refused when the page is hidden or the browser has none; the reading works without it.
  async function keepScreenOn() {
    if (!session || session.wakeLock || document.visibilityState !== 'visible') return
    const current = session
    try {
      const lock = (await navigator.wakeLock?.request('screen')) ?? null
      if (session === current) current.wakeLock = lock
      else void lock?.release().catch(() => undefined)
    } catch {
      // Refused: low battery, a policy, or no support. Nothing to tell the listener.
    }
  }

  function onVisibility() {
    if (!session || document.visibilityState !== 'visible') return
    // The browser drops the wake lock whenever the page hides, so take it again.
    session.wakeLock = null
    void keepScreenOn()
    // Chrome resumes a suspended context without a tap; iOS may not, and then Resume stays offered.
    if (!session.trackEnded && !isRunning(session.context)) void session.context.resume().catch(() => undefined)
  }

  function attach(context: AudioContext, stream: MediaStream, source: AudioNode, startedAt: number) {
    detach()
    const analyser = context.createAnalyser()
    analyser.fftSize = 2048
    source.connect(analyser)
    const track = stream.getAudioTracks()[0] ?? null
    const onEnded = () => {
      if (session) session.trackEnded = true
      refreshPaused()
    }
    context.addEventListener('statechange', refreshPaused)
    track?.addEventListener('mute', refreshPaused)
    track?.addEventListener('unmute', refreshPaused)
    track?.addEventListener('ended', onEnded)
    document.addEventListener('visibilitychange', onVisibility)
    session = {
      context,
      track,
      analyser,
      samples: new Float32Array(analyser.fftSize),
      startedAt,
      quietSince: null,
      everLocked: false,
      trackEnded: track?.readyState === 'ended',
      timer: window.setInterval(tick, LEVEL_POLL_MS),
      wakeLock: null,
      release: () => {
        context.removeEventListener('statechange', refreshPaused)
        track?.removeEventListener('mute', refreshPaused)
        track?.removeEventListener('unmute', refreshPaused)
        track?.removeEventListener('ended', onEnded)
        document.removeEventListener('visibilitychange', onVisibility)
        try { source.disconnect(analyser) } catch { /* the context may already be closed */ }
      },
    }
    refreshPaused()
    void keepScreenOn()
  }

  function markLocked() {
    if (!session) return
    session.everLocked = true
    offerTap.value = false
  }

  /**
   * The listener's tap on Resume, the user gesture iOS wants before audio runs again. Answers
   * 'restart' when the mic track itself ended, since no resume brings that back.
   */
  async function resume(): Promise<'resumed' | 'restart'> {
    if (!session) return 'restart'
    if (session.trackEnded) return 'restart'
    try {
      await session.context.resume()
    } catch {
      return 'restart'
    }
    refreshPaused()
    void keepScreenOn()
    return 'resumed'
  }

  function detach() {
    if (session) {
      window.clearInterval(session.timer)
      session.release()
      void session.wakeLock?.release().catch(() => undefined)
    }
    session = null
    paused.value = false
    tooQuiet.value = false
    offerTap.value = false
  }

  /** Clears the per-session flags; called when a new session starts, after they were reported. */
  function resetReport() {
    wasInterrupted.value = false
    wasQuiet.value = false
  }

  return { paused, tooQuiet, offerTap, wasInterrupted, wasQuiet, attach, markLocked, resume, detach, resetReport }
}
