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

/** Ahead of the input by less than this may only be a late report, and says nothing */
const latestReportSeconds = 1;

export type SampleClock = {
  /** The input has delivered this much since it started, by its own clock */
  observe: (deliveredSeconds: number) => void;
  /** Whether a silent quantum is owed before this one, of this many frames */
  advance: (frames: number) => boolean;
};

export function createSampleClock(sampleRate: number): SampleClock {
  const windowFrames = windowSeconds * sampleRate;
  const tolerance = toleranceSeconds * sampleRate;
  const longestOwed = longestOwedSeconds * sampleRate;
  const latestReport = latestReportSeconds * sampleRate;
  // What the input had delivered before the first frame counted here
  let offset: number | null = null;
  let rendered = 0;
  let smallest = Number.POSITIVE_INFINITY;
  let largest = Number.NEGATIVE_INFINITY;
  let credited = 0;
  let owed = 0;
  // Paid across the next window, at the pace it was lost: a lump would stretch the beats around it, and squeeze the others
  let pace = 0;
  let accrued = 0;
  let renderedInWindow = 0;

  function startOver(): void {
    offset = null;
    credited = 0;
    owed = 0;
  }

  function settle(): void {
    if (largest < -latestReport) {
      // The whole window far ahead of the input: it paused, or stayed silent. Nothing to bank against what comes next.
      offset! += largest;
      credited = 0;
      return;
    }

    const gained = smallest - credited;

    if (gained > longestOwed) {
      startOver();
    } else if (gained >= tolerance) {
      // Only upward: a thread can't get lost audio back, so what falls and rises again was never lost.
      owed = Math.min(longestOwed, owed + gained);
      credited = smallest;
    }
  }

  function closeWindow(): void {
    // No report in the window, the main thread being busy, says nothing: the next one will.
    if (smallest !== Number.POSITIVE_INFINITY) {
      settle();
    }

    pace = owed / renderedInWindow;
    smallest = Number.POSITIVE_INFINITY;
    largest = Number.NEGATIVE_INFINITY;
    renderedInWindow = 0;
  }

  return {
    observe(deliveredSeconds) {
      const delivered = deliveredSeconds * sampleRate;

      offset ??= delivered - rendered;

      const deficit = delivered - offset - rendered;

      smallest = Math.min(smallest, deficit);
      largest = Math.max(largest, deficit);
    },
    advance(frames) {
      rendered += frames;
      renderedInWindow += frames;

      if (renderedInWindow >= windowFrames) {
        closeWindow();
      }

      accrued += pace * frames;

      if (accrued >= frames && owed >= frames) {
        accrued -= frames;
        owed -= frames;

        return true;
      }

      return false;
    },
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
