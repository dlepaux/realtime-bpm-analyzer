import type {Summary, TrackResult} from './types';

export const toleranceRatio = 0.04;

/** Metrical levels Acc2 forgives, as defined by Gouyon et al. 2006 */
const acc2Factors = [1, 2, 3, 1 / 2, 1 / 3];

export function isCorrect(reading: number, truth: number): boolean {
  return Math.abs(reading - truth) <= toleranceRatio * truth;
}

export function isOctaveCorrect(reading: number, truth: number): boolean {
  return acc2Factors.some(factor => isCorrect(reading, truth * factor));
}

function share(count: number, total: number): number {
  return total === 0 ? 0 : count / total;
}

function median(sorted: readonly number[]): number | null {
  if (sorted.length === 0) {
    return null;
  }

  const middle = (sorted.length - 1) / 2;
  const value = (sorted[Math.floor(middle)] + sorted[Math.ceil(middle)]) / 2;

  return Number.isFinite(value) ? value : null;
}

/**
 * Scores what the listener saw, per the definitions in benchmark/readme.md
 * @param results One detector's results
 * @returns Aggregate metrics
 */
export function summarize(results: readonly TrackResult[]): Summary {
  const finals = results.flatMap(r => (r.final === null ? [] : [{final: r.final, truth: r.truth}]));
  const firstCorrect = results
    .map(r => r.firstCorrectAt ?? Number.POSITIVE_INFINITY)
    .sort((a, b) => a - b);
  const stable = results.flatMap(r => r.stable.map(([, bpm]) => ({bpm, truth: r.truth})));
  const firstStable = results.flatMap(r => (r.stable.length > 0 ? [{bpm: r.stable[0][1], truth: r.truth}] : []));
  const offline = results.filter(r => r.offline !== undefined);
  const hasOffline = results.length > 0 && offline.length === results.length;

  const summary: Summary = {
    tracks: results.length,
    acc1: share(finals.filter(r => isCorrect(r.final, r.truth)).length, results.length),
    acc2: share(finals.filter(r => isOctaveCorrect(r.final, r.truth)).length, results.length),
    medianFirstCorrect: median(firstCorrect),
    everCorrect: share(results.filter(r => r.firstCorrectAt !== null).length, results.length),
    falseStable: stable.length === 0
      ? null
      : share(stable.filter(r => !isCorrect(r.bpm, r.truth)).length, stable.length),
    falseFirstStable: firstStable.length === 0
      ? null
      : share(firstStable.filter(r => !isCorrect(r.bpm, r.truth)).length, firstStable.length),
    stableCoverage: share(firstStable.length, results.length),
    stableReadings: stable.length,
  };

  if (!hasOffline) {
    return summary;
  }

  return {
    ...summary,
    offlineAcc1: share(offline.filter(r => r.offline != null && isCorrect(r.offline, r.truth)).length, results.length),
    offlineAcc2: share(offline.filter(r => r.offline != null && isOctaveCorrect(r.offline, r.truth)).length, results.length),
  };
}
