// Plays the demo's data (extension-scenes-timeline.ts) with the Web Animations API. Loaded only where the
// demo moves, so a phone or a visitor who asked for less motion never fetches it. Every animation
// is transform or opacity, so the browser's compositor runs them and the BPM tool beside the demo
// keeps the main thread. Nothing here reads the time: pausing is the animations' own.
import {
  DOT_PULSE,
  SCENE_LOOPS,
  dotTiming,
  loopTiming,
  sequenceTracks,
  totalSeconds,
  visits,
  type Frame,
  type LoopTiming,
  type PillWidths,
} from './extension-scenes-timeline'

export type ScenesPlayback = {
  readonly pause: () => void
  readonly resume: () => void
  readonly stop: () => void
}

function measureWidths(root: Element): PillWidths {
  const pill = root.querySelector('.pill')
  const stack = root.querySelector('.stack')
  const reading = root.querySelector('.reading')
  const settling = root.querySelector(`.hint[data-stability='settling']`)
  if (!pill || !stack || !reading || !settling) throw new Error('the demo\'s overlay is missing an element')
  const emSize = Number.parseFloat(getComputedStyle(pill).fontSize)
  const width = (element: Element) => element.getBoundingClientRect().width
  const stable = width(pill)
  const atStack = (stackWidth: number) => (stable + stackWidth - width(stack)) / emSize
  return {
    stable: stable / emSize,
    listening: atStack(width(reading)),
    settling: atStack(Math.max(width(reading), width(settling))),
  }
}

type Timing = Pick<LoopTiming, 'delay' | 'duration'> & Partial<LoopTiming> & { readonly fill?: FillMode }

function make(element: Element, frames: readonly Frame[], timing: Timing): Animation {
  const effect = new KeyframeEffect(element, frames as Keyframe[], {
    delay: timing.delay * 1000,
    duration: timing.duration * 1000,
    iterations: timing.iterations ?? 1,
    iterationStart: timing.iterationStart ?? 0,
    fill: timing.fill ?? 'both',
  })
  return new Animation(effect, document.timeline)
}

/**
 * Everything in the sequence, unstarted. Each scene's picture moves only while it is on screen, and
 * those loops hold no fill: the video's second visit would otherwise pin its first to a still frame,
 * since a later animation's waiting pose outranks an earlier one's motion.
 */
function buildAnimations(root: Element): Animation[] {
  const total = totalSeconds()
  const all = (selector: string) => [...root.querySelectorAll(selector)]
  const animations = sequenceTracks(measureWidths(root)).flatMap((track) =>
    all(track.target).map((element) => make(element, track.frames, { delay: 0, duration: total })))
  for (const visit of visits()) {
    const scope = `.ext-scene[data-scene='${visit.scene.id}']`
    for (const loop of SCENE_LOOPS[visit.scene.id]) {
      const timing = { ...loopTiming(loop, visit.scene.bpm, visit), fill: 'none' as const }
      for (const element of all(`${scope} ${loop.target}`)) animations.push(make(element, loop.frames, timing))
    }
    if (visit.enter === 0) continue
    all('.dots span').forEach((dot, index) => animations.push(make(dot, DOT_PULSE.frames, { ...dotTiming(visit, index), fill: 'none' })))
  }
  return animations
}

/** Starts the sequence from its first frame. Returns null when a browser can't run it. */
export function playScenes(root: Element, onEnd: () => void): ScenesPlayback | null {
  if (typeof KeyframeEffect === 'undefined') return null
  const animations = buildAnimations(root)
  const now = document.timeline.currentTime
  for (const animation of animations) {
    animation.startTime = now
  }
  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    for (const animation of animations) animation.cancel()
  }
  // The longest runs the whole length, so this is the end of the sequence.
  void animations[0]?.finished.then(() => {
    if (stopped) return
    stop()
    onEnd()
  }).catch(() => undefined)
  return {
    // Only what is under way: play() rewinds a finished animation, which would restart an earlier
    // page's loops and dots underneath the current one.
    pause: () => { for (const animation of animations) if (animation.playState === 'running') animation.pause() },
    resume: () => { for (const animation of animations) if (animation.playState === 'paused') animation.play() },
    stop,
  }
}
