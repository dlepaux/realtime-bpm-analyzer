// When the BPM tool counts as seen (RBA-298): the first time, in a page view, that its input area
// is at least half on screen. RBA-294 found that most mobile home visits leave in seconds without
// starting anything, and nothing said whether the tool had ever been on screen; this event tells
// "never saw it" from "saw it and left", and whether seeing it took a scroll.
//
// An IntersectionObserver reports the crossing, so nothing polls, and it is dropped after the
// first sighting. `load`: half visible in the observer's first report, or later without the page
// having scrolled (the layout moved it in). `scroll`: half visible only after the page scrolled.
// Pure apart from the browser objects it is handed, so node --test runs it with stand-ins.

export const SEEN_RATIO = 0.5

export const SEEN_ON = ['load', 'scroll'] as const
export type SeenOn = (typeof SEEN_ON)[number]

/** The pages the tool is on, by name: the event says which, never the address. */
export const TOOL_PAGES = ['home', 'video-bpm', 'other'] as const
export type ToolPage = (typeof TOOL_PAGES)[number]

type Entry = { readonly isIntersecting: boolean; readonly intersectionRatio: number }
type ObserverLike = { observe(target: Element): void; disconnect(): void }
type ScrollSource = {
  addEventListener(type: 'scroll', listener: () => void, options: { passive: true }): void
  removeEventListener(type: 'scroll', listener: () => void): void
}

export type ToolSeenEnv = {
  readonly observer: (callback: (entries: readonly Entry[]) => void, options: { threshold: number }) => ObserverLike
  readonly scroll: ScrollSource
}

const browserEnv = (): ToolSeenEnv | null =>
  typeof window === 'undefined' || typeof IntersectionObserver === 'undefined'
    ? null
    : { observer: (callback, options) => new IntersectionObserver(callback, options), scroll: window }

/** The page a path is: www's clean address, its .html form, or the home's index. */
export function toolPageOf(pathname: string): ToolPage {
  const path = pathname.replace(/\.html$/, '').replace(/(^|\/)index$/, '').replace(/\/+$/, '')
  if (path === '') return 'home'
  if (path === '/video-bpm') return 'video-bpm'
  return 'other'
}

/** Calls `onSeen` once, when `target` is first half visible. Returns the stop for an unmount. */
export function watchToolSeen(target: Element, onSeen: (on: SeenOn) => void, env: ToolSeenEnv | null = browserEnv()): () => void {
  if (!env) return () => {}
  const { scroll } = env
  let firstReport = true
  let scrolled = false
  let stopped = false
  const onScroll = () => { scrolled = true }
  const observer = env.observer((entries) => {
    const inView = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= SEEN_RATIO)
    const onLoad = firstReport || !scrolled
    firstReport = false
    if (!inView || stopped) return
    stop()
    onSeen(onLoad ? 'load' : 'scroll')
  }, { threshold: SEEN_RATIO })
  function stop() {
    if (stopped) return
    stopped = true
    observer.disconnect()
    scroll.removeEventListener('scroll', onScroll)
  }
  scroll.addEventListener('scroll', onScroll, { passive: true })
  observer.observe(target)
  return stop
}
