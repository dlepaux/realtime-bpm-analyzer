/**
 * Keeps the analyzer's time true when the audio thread falls behind a live input.
 *
 * Both detectors take sample counts for time. That holds while the audio thread renders in real time. When
 * it can't, a live input (a MediaStream: tab capture, a microphone) keeps arriving at its own pace, and the
 * browser drops what its small buffer can't hold, so the analyzer hears time go by faster than it did and
 * reads the tempo as tempo / rate: 150 BPM at 90% reads 167, marked stable. Silence in place of what was
 * lost puts the beats back where they were (RBA-97: on the tempogram, generated grooves at 91 to 150 BPM read
 * right down to 70%).
 *
 * A stall the thread recovers from is left alone: the browser renders what it missed in a burst, fills the
 * gap itself, and the beats stay in place (measured, stalls up to 500 ms). So only the deficit that remains
 * throughout a whole window counts, which a burst of catching up brings back down.
 */

/** A window holds the smallest deficit seen, which outlasts any stall the thread recovers from */
const windowMs = 1000;

/**
 * Longer between two calls and the clock starts over: a sleeping laptop or a suspended context lost nothing
 * the analyzer should wait for, and silence that long would flush its window for no reason
 */
const longestGapMs = 1000;

/** A deficit under this is the audio device's own pace against the system clock: nothing to correct */
const toleranceSeconds = 0.02;

/** Past this share of lost audio there is no tempo to protect, so what is owed stops growing */
const longestOwedSeconds = 2;

/** Whether a silent quantum is owed before this one, given the time now and the frames this quantum holds */
export type SampleClock = (nowMs: number, frames: number) => boolean;

/**
 * Creates the clock of one live input.
 * @param sampleRate Sample rate in Hz
 * @returns The function to call once per render quantum
 */
export function createSampleClock(sampleRate: number): SampleClock {
  const tolerance = toleranceSeconds * sampleRate;
  const longestOwed = longestOwedSeconds * sampleRate;
  let startMs: number | null = null;
  let lastMs = 0;
  let windowStartMs = 0;
  let rendered = 0;
  let smallest = Number.POSITIVE_INFINITY;
  let credited = 0;
  let owed = 0;
  // Paid across the next window, at the pace it was lost: a lump would stretch the beats around it, and squeeze the others
  let pace = 0;
  let accrued = 0;
  let renderedInWindow = 0;

  function startAt(nowMs: number): void {
    startMs = nowMs;
    windowStartMs = nowMs;
    rendered = 0;
    smallest = Number.POSITIVE_INFINITY;
    credited = 0;
    owed = 0;
    pace = 0;
    accrued = 0;
    renderedInWindow = 0;
  }

  function closeWindow(nowMs: number): void {
    const gained = smallest - credited;

    if (gained >= tolerance) {
      owed = Math.min(longestOwed, owed + gained);
      credited = smallest;
    } else if (gained < 0) {
      credited = smallest;
    }

    pace = owed / renderedInWindow;
    smallest = Number.POSITIVE_INFINITY;
    windowStartMs = nowMs;
    renderedInWindow = 0;
  }

  return function advance(nowMs: number, frames: number): boolean {
    if (startMs === null || nowMs - lastMs > longestGapMs) {
      startAt(nowMs);
    }

    lastMs = nowMs;
    rendered += frames;
    renderedInWindow += frames;

    let deficit = (((nowMs - startMs!) / 1000) * sampleRate) - rendered;

    if (deficit < 0) {
      // Ahead of the system clock: no time is banked against a later deficit
      startMs = nowMs - ((rendered / sampleRate) * 1000);
      deficit = 0;
    }

    smallest = Math.min(smallest, deficit);

    if (nowMs - windowStartMs >= windowMs) {
      closeWindow(nowMs);
    }

    accrued += pace * frames;

    if (accrued >= frames && owed >= frames) {
      accrued -= frames;
      owed -= frames;

      return true;
    }

    return false;
  };
}
