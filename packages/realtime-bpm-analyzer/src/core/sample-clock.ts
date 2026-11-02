/**
 * Keeps the analyzer's time true when the audio thread falls behind a live input.
 *
 * Both detectors take sample counts for time. That holds while the audio thread keeps pace with its input.
 * When it can't, a live input (a MediaStream: tab capture, a microphone) keeps arriving at its own pace and the
 * browser drops what its small buffer can't hold, so the analyzer hears time go by faster than it did and reads
 * the tempo as tempo / rate: 150 BPM at 90% reads 167, marked stable. Silence in place of what was lost puts
 * the beats back where they were.
 *
 * The reference has to be the input's own clock, not the system clock. When the whole browser loses the CPU the
 * capture slows with the thread, nothing is dropped, and paying the difference to system time makes the tempo
 * read low instead (RBA-97: 150 read 135, marked stable).
 *
 * What the input has delivered reaches this clock late, never early, so a late report can only make the
 * deficit look smaller. A stall the thread recovers from is left alone: it renders what it missed in a burst, so
 * the smallest deficit of a window stays where it was (measured, stalls up to 500 ms).
 *
 * Paid silence puts the beats back on average, not each one: under sustained loss the tempogram still moves a hop
 * or two (RBA-97: 120 read 117 and 118, 150 read 148). Below half speed the clock can't even pay what is lost. So
 * while it is behind, a reading is usable but not to be called stable: see `isBehind`.
 */

/** A window holds the smallest deficit seen, which outlasts any stall the thread recovers from */
const windowSeconds = 1;

/** A deficit under this is the browser's buffer filling, which lost nothing */
const toleranceSeconds = 0.02;

/**
 * More than this lost in one window is a context suspended or a laptop asleep, and the clock starts over: nothing
 * there is worth waiting for. It also bounds the silence owed, past which there is no tempo to protect.
 */
const longestOwedSeconds = 2;

/**
 * The input delivering nothing for this long has paused: time passes that it never meant to deliver, and none of that
 * was lost. Told apart by what it delivered and not by the deficit falling, which a late report does as well. Longer
 * than the time between reports of the track's clock, which moves in steps of 10 ms (measured).
 */
const pauseSeconds = 0.5;

/** Lost in a window at this share of it or more, the clock is behind. Up to five percent reads right once paid (measured, 0.95 read 150 and 120). */
const behindShare = 0.05;

/** Windows with nothing lost before the clock stops being behind */
const windowsToRecover = 3;

export type SampleClock = {
  /** The input has delivered this much since it started, by its own clock */
  observe: (deliveredSeconds: number) => void;
  /** Whether a silent quantum is owed before this one, of this many frames */
  advance: (frames: number) => boolean;
  /** Whether time is being lost now, so that what the analyzer hears can't be called stable */
  isBehind: () => boolean;
};

export function createSampleClock(sampleRate: number): SampleClock {
  const windowFrames = windowSeconds * sampleRate;
  const tolerance = toleranceSeconds * sampleRate;
  const longestOwed = longestOwedSeconds * sampleRate;
  const pause = pauseSeconds * sampleRate;
  // What the input had delivered before the first frame counted here
  let offset: number | null = null;
  let rendered = 0;
  let smallest = Number.POSITIVE_INFINITY;
  let credited = 0;
  let owed = 0;
  // Paid across the next window, at the pace it was lost: a lump would stretch the beats around it, and squeeze the others
  let pace = 0;
  let accrued = 0;
  let renderedInWindow = 0;
  let lastDelivered = Number.NEGATIVE_INFINITY;
  let renderedAtLastDelivered = 0;
  let paused = false;
  let behind = false;
  let cleanWindows = 0;

  function startOver(): void {
    offset = null;
    lastDelivered = Number.NEGATIVE_INFINITY;
    paused = false;
    credited = 0;
    owed = 0;
  }

  /** Banks what a window lost, and returns how much that was */
  function settle(): number {
    const gained = smallest - credited;

    if (gained > longestOwed) {
      startOver();

      return gained;
    }

    if (gained >= tolerance) {
      // Only upward: a thread can't get lost audio back, so what falls and rises again was never lost.
      owed = Math.min(longestOwed, owed + gained);
      credited += gained;

      return gained;
    }

    return 0;
  }

  function closeWindow(): void {
    // No report in the window, the main thread being busy, says nothing: the next one will.
    const lost = smallest === Number.POSITIVE_INFINITY ? 0 : settle();

    if (lost >= behindShare * renderedInWindow) {
      behind = true;
      cleanWindows = 0;
    } else if (behind) {
      cleanWindows += 1;
      behind = cleanWindows < windowsToRecover;
    }

    pace = owed / renderedInWindow;
    smallest = Number.POSITIVE_INFINITY;
    renderedInWindow = 0;
  }

  return {
    observe(deliveredSeconds) {
      const delivered = deliveredSeconds * sampleRate;

      offset ??= delivered - rendered;

      if (delivered > lastDelivered) {
        if (paused) {
          // Back where it paused, whatever passed since: none of that was lost.
          offset = delivered - rendered - credited;
          smallest = Number.POSITIVE_INFINITY;
          paused = false;
        }

        lastDelivered = delivered;
        renderedAtLastDelivered = rendered;
      } else if (rendered - renderedAtLastDelivered > pause) {
        paused = true;
      }

      if (paused) {
        return;
      }

      const deficit = delivered - offset - rendered;

      smallest = Math.min(smallest, deficit);
    },
    advance(frames) {
      rendered += frames;
      renderedInWindow += frames;

      if (renderedInWindow >= windowFrames) {
        closeWindow();
      }

      // Bounded by what is owed: a long clean stretch mustn't save up into a lump.
      accrued = Math.min(accrued + pace * frames, Math.max(owed, frames));

      if (accrued >= frames && owed >= frames) {
        accrued -= frames;
        owed -= frames;

        return true;
      }

      return false;
    },
    isBehind: () => behind,
  };
}

/** The part of the MediaStreamTrack statistics read here. Newer than the DOM types, and not in every browser */
type TrackWithStats = MediaStreamTrack & {readonly stats?: {readonly totalFramesDuration: number}};

/** How often the worklet hears how far the input has come: a few per window */
const reportEveryMs = 250;

/**
 * Tells `report` how far the track has come by its own clock, until the track ends or the returned function is
 * called. Does nothing where the browser doesn't count: the analyzer then runs as it does without a live input.
 * @param track The track the analyzer listens to
 * @param report Receives the seconds the track has delivered
 * @returns Stops the reports
 */
export function followTrackClock(track: MediaStreamTrack, report: (deliveredSeconds: number) => void): () => void {
  if (!('stats' in track)) {
    return () => undefined;
  }

  const timer = setInterval(() => {
    if (track.readyState === 'ended') {
      clearInterval(timer);
      return;
    }

    const duration = (track as TrackWithStats).stats?.totalFramesDuration;

    if (typeof duration === 'number') {
      report(duration / 1000);
    }
  }, reportEveryMs);

  return () => {
    clearInterval(timer);
  };
}
