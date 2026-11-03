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

/** Lost in a window at this share of it or more, the clock is behind. Up to five percent reads right once paid (measured, 0.95 read 150 and 120). Deficits move in steps and a window keeps the smallest, so the edge is soft: 96% render was behind for part of the time. */
const behindShare = 0.05;

/** Windows with nothing lost before the clock stops being behind */
const windowsToRecover = 3;

/** Going this many windows without a report, the clock can't say whether anything is being lost */
const windowsToGoBlind = 3;

/**
 * Lost in a spell behind and since the analyzer started over, past this what it heard can't back a lock, so it starts
 * over when the loss ends. Under it a lock read within 1 BPM (RBA-97, simulated: 596 runs, 100 to 174 BPM), and
 * starting over would cost a capture 11.5 s for one small drop. Above the 0.25 s a healed stall of 1.9 s adds, and
 * below the 0.9 s that first read 143 for 100.
 */
const lostToStartOverSeconds = 0.3;

/**
 * Loss takes up to this many windows to show as behind, because a window keeps its smallest deficit. A lock published
 * in that time may have heard it.
 */
const windowsToNotice = 3;

export type SampleClock = {
  /** The input has delivered this much since it started, by its own clock */
  observe: (deliveredSeconds: number) => void;
  /** Whether a silent quantum is owed before this one, of this many frames */
  advance: (frames: number) => boolean;
  /** Whether time is being lost now */
  isBehind: () => boolean;
  /** Whether a lock would be refused now: time is being lost, or the clock has stopped reporting */
  isLosing: () => boolean;
  /** Asks to publish a lock, and remembers the answer: no while behind or blind, and the analyzer then has to start over */
  offerLock: () => boolean;
  /** Whether the analyzer should start over now, because what it heard was lost. Answers yes once for each loss */
  takeStartOver: () => boolean;
  /** The analyzer started over: it no longer holds any lock, or anything that was lost */
  forget: () => void;
};

export function createSampleClock(sampleRate: number): SampleClock {
  const windowFrames = windowSeconds * sampleRate;
  const tolerance = toleranceSeconds * sampleRate;
  const longestOwed = longestOwedSeconds * sampleRate;
  const pause = pauseSeconds * sampleRate;
  const blindAfter = windowsToGoBlind * windowFrames;
  const lostToStartOver = lostToStartOverSeconds * sampleRate;
  const notice = windowsToNotice * windowFrames;
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
  let renderedAtLastReport: number | null = null;
  // The rest is about the analyzer's memory, so it lasts until the analyzer starts over, not the clock
  let renderedAtLock: number | null = null;
  let lockPrecedesLoss = false;
  let lostSinceForgotten = 0;
  let mustStartOver = false;

  function startOver(): void {
    offset = null;
    lastDelivered = Number.NEGATIVE_INFINITY;
    paused = false;
    credited = 0;
    owed = 0;
    smallest = Number.POSITIVE_INFINITY;
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

  function judge(lost: number): void {
    lostSinceForgotten += lost;

    if (lost >= behindShare * renderedInWindow) {
      if (!behind) {
        lockPrecedesLoss = renderedAtLock !== null && rendered - renderedAtLock >= notice;
      }

      behind = true;
      cleanWindows = 0;
    } else if (behind) {
      cleanWindows += 1;
      behind = cleanWindows < windowsToRecover;
    }

    if (behind && !lockPrecedesLoss && lostSinceForgotten >= lostToStartOver) {
      mustStartOver = true;
    }
  }

  function closeWindow(): void {
    // A window with no report, the main thread being busy or the input paused, says nothing either way: not lost, not clean.
    if (smallest !== Number.POSITIVE_INFINITY) {
      judge(settle());
    }

    pace = owed / renderedInWindow;
    smallest = Number.POSITIVE_INFINITY;
    renderedInWindow = 0;
  }

  function isBlind(): boolean {
    return renderedAtLastReport !== null && rendered - renderedAtLastReport > blindAfter;
  }

  function forget(): void {
    renderedAtLock = null;
    lockPrecedesLoss = false;
    lostSinceForgotten = 0;
    mustStartOver = false;
  }

  return {
    observe(deliveredSeconds) {
      const delivered = deliveredSeconds * sampleRate;

      // No browser should send these. Believed, one would freeze the clock for good.
      if (!Number.isFinite(delivered) || delivered < 0) {
        return;
      }

      renderedAtLastReport = rendered;

      // The counter only goes up, so a step back means it restarted, or that the highest value was the wrong one.
      if (delivered < lastDelivered) {
        startOver();
      }

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
    isLosing: () => behind || isBlind(),
    offerLock() {
      if (behind || isBlind()) {
        mustStartOver = true;

        return false;
      }

      renderedAtLock = rendered;

      return true;
    },
    takeStartOver() {
      if (!mustStartOver || behind || isBlind()) {
        return false;
      }

      forget();

      return true;
    },
    forget,
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
