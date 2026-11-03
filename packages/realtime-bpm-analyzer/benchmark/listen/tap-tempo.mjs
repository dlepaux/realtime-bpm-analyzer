// Tap tempo for the RBA-59 listening page. Plain JS (.mjs) so listen.py can serve it as is, with no build step on the box.

/** Taps before a tempo shows: seven intervals, enough for the median to shrug off one bad tap */
export const tapsBeforeTempo = 8;

/** Only the latest taps count, so a long session stays bounded and a slow drift is followed */
export const tapsKept = 64;

/** A pause this long means a new start: the old taps would drag the median */
export const restartAfterMs = 2500;

/**
 * Rounds to one decimal, the precision the page shows and the answer file keeps.
 * @param {number} value
 * @returns {number}
 */
export function round1(value) {
  return Math.round(value * 10) / 10;
}

/**
 * Adds a tap to the series, starting over after a long pause.
 * @param {readonly number[]} taps Tap times in milliseconds, oldest first
 * @param {number} at This tap's time in milliseconds
 * @returns {number[]} A new series; the input is left alone
 */
export function addTap(taps, at) {
  const last = taps.at(-1);

  if (last === undefined || at - last > restartAfterMs || at <= last) {
    return [at];
  }

  return [...taps, at].slice(-tapsKept);
}

/**
 * The tempo of a tap series from the median interval, so a missed or doubled tap barely moves it.
 * @param {readonly number[]} taps Tap times in milliseconds, oldest first
 * @returns {number | null} BPM rounded to 0.1, or null before eight taps
 */
export function tempoFromTaps(taps) {
  if (taps.length < tapsBeforeTempo) {
    return null;
  }

  const intervals = taps.slice(1).map((at, index) => at - taps[index]).sort((a, b) => a - b);
  const middle = Math.floor(intervals.length / 2);
  const median = intervals.length % 2 === 1 ? intervals[middle] : (intervals[middle - 1] + intervals[middle]) / 2;

  return median > 0 ? round1(60_000 / median) : null;
}

/**
 * How far each of the latest intervals may stray from their median for the taps to count as steady.
 * Loose enough that ordinary tapping (a few percent per interval) gets there, tight enough that a
 * missed, doubled or clearly stray tap does not: the median of seven such intervals lands within
 * about 2% of the tempo, inside the 4% the score allows.
 */
export const steadyWithin = 0.1;

/**
 * Whether the latest eight taps are even enough to save: no interval strays more than 10% from their median.
 * The first batch ran 40 to 64 taps a row; once eight are steady, more taps barely move the answer.
 * @param {readonly number[]} taps Tap times in milliseconds, oldest first
 * @returns {boolean}
 */
export function isSteady(taps) {
  if (taps.length < tapsBeforeTempo) {
    return false;
  }

  const latest = taps.slice(-tapsBeforeTempo);
  const intervals = latest.slice(1).map((at, index) => at - latest[index]);
  const median = [...intervals].sort((a, b) => a - b)[Math.floor(intervals.length / 2)];

  return median > 0 && intervals.every(interval => Math.abs(interval - median) <= steadyWithin * median);
}

/**
 * The answer after the half or double question.
 * @param {number | null} tapped The tapped BPM
 * @param {number} factor Product of the x0.5 and x2 presses, a power of two
 * @returns {number | null}
 */
export function finalTempo(tapped, factor) {
  return tapped === null ? null : round1(tapped * factor);
}
