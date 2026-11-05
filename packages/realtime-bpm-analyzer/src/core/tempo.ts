import {descendingOverThresholds} from './utils';
import type {
  RungTempos,
  Interval,
  Tempo,
  TempoRange,
  AnalyzerGroupByTempoOptions,
  AnalyzerComputeBpmOptions,
  ValidPeaks,
} from './types';
import * as consts from './consts';

/**
 * Return the computed bpm from data
 * @param options - AnalyzerComputeBpmOptions
 * @param options.data - Contain valid peaks
 * @param options.audioSampleRate - Audio sample rate
 * @param options.tempoRange - Range every tempo is folded into (default: 90–180 BPM)
 * @returns A Promise that resolves BPM Candidates
 */
export async function computeBpm({
  audioSampleRate,
  data,
  tempoRange,
}: AnalyzerComputeBpmOptions): Promise<RungTempos> {
  /**
   * Flag to fix Object.keys looping
   */
  let hasPeaks = false;
  let foundThreshold = consts.minValidThreshold;

  await descendingOverThresholds(async (threshold: number) => {
    if (hasPeaks) {
      return true;
    }

    if (data[threshold] && data[threshold].length >= consts.requiredPeaks) {
      hasPeaks = true;
      foundThreshold = threshold;
    }

    return false;
  });

  if (hasPeaks && foundThreshold) {
    const intervals = identifyIntervals(data[foundThreshold]);
    const tempos = groupByTempo({audioSampleRate, intervalCounts: intervals, tempoRange});
    const candidates = getTopCandidates(tempos);

    return {bpm: candidates, threshold: foundThreshold};
  }

  return {
    bpm: [],
    threshold: foundThreshold,
  };
}

/**
 * Measure how close the valid peaks are to a first BPM result
 * @param data - Valid peaks by threshold
 * @returns From 0 to 1: the best-filled threshold's share of the peaks `computeBpm` needs
 */
export function computeProgress(data: ValidPeaks): number {
  // computeBpm succeeds as soon as any threshold is full, so the fullest one is the progress
  const mostPeaks = Math.max(0, ...Object.values(data).map(peaks => peaks.length));

  return Math.min(mostPeaks, consts.requiredPeaks) / consts.requiredPeaks;
}

/**
 * Sort results by count and return top candidate
 * @param candidates - BPMs with count
 * @param length - Amount of returned candidates (default: 5)
 * @returns Returns the 5 top candidates with highest counts
 */
export function getTopCandidates(candidates: Tempo[], length = 5): Tempo[] {
  return candidates.sort((a, b) => b.count - a.count).slice(0, length);
}

/**
 * Gets the top candidate from the array
 * @param candidates - BPMs with counts.
 * @returns Returns the top candidate with the highest count.
 * @throws {Error} When the candidates array is empty (insufficient samples for reliable detection)
 */
export function getTopCandidate(candidates: Tempo[]): number {
  if (candidates.length === 0) {
    throw new Error(
      `getTopCandidate: no candidates found (0 peaks detected; minimum required is ${consts.minPeaks}). `
      + 'Audio may be too silent or too short — ensure at least ~10 seconds of audio at 90 BPM.',
    );
  }

  const [first] = candidates.sort((a, b) => b.count - a.count);

  return first.tempo;
}

/**
 * Identify intervals between bass peaks
 * @param peaks - Array of qualified bass peaks
 * @returns Return a collection of intervals between peaks
 */
export function identifyIntervals(peaks: readonly number[]): Interval[] {
  const intervals: Interval[] = [];

  for (let n = 0; n < peaks.length; n++) {
    // I starts at 1: peaks[n]-peaks[n] would produce a spurious 0 interval on every pass
    for (let i = 1; i < consts.maxIntervalComparisons; i++) {
      const peakIndex = n + i;
      // Bounds check: reading past peaks.length yields undefined, producing NaN intervals that leak downstream
      if (peakIndex >= peaks.length) {
        break;
      }

      const interval = peaks[peakIndex] - peaks[n];

      /**
       * Try and find a matching interval and increase it's count
       */
      const foundInterval = intervals.find(
        (intervalCount: Interval) => intervalCount.interval === interval,
      );

      if (foundInterval) {
        // Create new object with incremented count (immutable update)
        const index = intervals.indexOf(foundInterval);
        intervals[index] = {
          interval: foundInterval.interval,
          count: foundInterval.count + 1,
        };
      } else {
        intervals.push({
          interval,
          count: 1,
        });
      }
    }
  }

  return intervals;
}

/**
 * Validate a caller-supplied tempo range, or return the default 90–180 BPM
 * @param tempoRange - Range from the caller's options
 * @returns A range every tempo can be folded into
 * @throws {RangeError} When a bound is not a positive finite number, or the range spans less than one octave
 */
export function resolveTempoRange(tempoRange?: TempoRange): TempoRange {
  if (tempoRange === undefined) {
    return {min: consts.minBpmRange, max: consts.maxBpmRange};
  }

  const min: unknown = tempoRange?.min;
  const max: unknown = tempoRange?.max;
  const isPositiveFinite = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;

  if (!isPositiveFinite(min) || !isPositiveFinite(max)) {
    throw new RangeError(
      `Invalid tempoRange: min and max must be positive finite numbers (got min=${String(min)}, max=${String(max)}).`,
    );
  }

  // Folding moves a tempo by whole octaves, so a narrower range can leave it outside both bounds
  if (max < min * 2) {
    throw new RangeError(
      `Invalid tempoRange: max (${max}) must be at least twice min (${min}) so that every tempo has an octave inside the range.`,
    );
  }

  return {min, max};
}

/**
 * Figure out best possible tempo candidates
 * @param options - AnalyzerGroupByTempoOptions
 * @param options.audioSampleRate - Audio sample rate
 * @param options.intervalCounts - List of identified intervals
 * @param options.tempoRange - Range every tempo is folded into (default: 90–180 BPM)
 * @returns Intervals grouped with similar values, each with its confidence
 */
export function groupByTempo({
  audioSampleRate,
  intervalCounts,
  tempoRange,
}: AnalyzerGroupByTempoOptions): Tempo[] {
  const {min, max} = resolveTempoRange(tempoRange);
  // Keyed by the whole BPM each vote rounds to. A Map keeps first-seen order, which breaks ties in the ranking
  // exactly as the array this replaced did, so `tempo` and `count` are unchanged from 5.x
  const groups = new Map<number, Votes>();
  // The same votes seen from across the range's edge, for the exact tempo only (see withConfidence)
  const acrossEdge = new Map<number, Votes>();

  for (const intervalCount of intervalCounts) {
    if (intervalCount.interval === 0) {
      continue;
    }

    let foldedTempo = 60 / (Math.abs(intervalCount.interval) / audioSampleRate);

    // Fold the tempo by octaves into the range (90-180 BPM by default)
    while (foldedTempo < min) {
      foldedTempo *= 2;
    }

    while (foldedTempo > max) {
      foldedTempo /= 2;
    }

    addVote(groups, foldedTempo, intervalCount.count);
    // An octave image the fold could have come from: a vote over max would fold to half, one under min to double
    if (foldedTempo * 2 > max) {
      addVote(acrossEdge, foldedTempo * 2, intervalCount.count);
    }

    if (foldedTempo / 2 < min) {
      addVote(acrossEdge, foldedTempo / 2, intervalCount.count);
    }
  }

  return withConfidence(groups, acrossEdge);
}

/** Adds `count` votes at an unrounded tempo to the group of the whole BPM it rounds to */
function addVote(groups: Map<number, Votes>, tempo: number, count: number): void {
  const key = Math.round(tempo);
  const votes = groups.get(key) ?? {count: 0, weightedSum: 0};
  groups.set(key, {count: votes.count + count, weightedSum: votes.weightedSum + (count * tempo)});
}

/** The interval votes that rounded to one whole BPM, and the sum of their unrounded tempos weighted by count */
type Votes = {
  readonly count: number;
  readonly weightedSum: number;
};

/**
 * Sets each tempo's confidence and exact tempo from the same ±1 BPM window (RBA-12 proposal v1, RBA-128).
 * Pooling neighbours absorbs rounding jitter, since a true 128 splits its votes over 127–129. The exact tempo is
 * the vote-weighted mean of the unrounded tempos in that window: a true 127.5 splits its votes between 127 and
 * 128, and only the window's mean comes back to 127.5, where the group's own mean would lean to its whole BPM.
 *
 * At an edge of the range the window also takes the votes folded across it: a true 90 with jitter puts its votes
 * under 90 at about 180, so the mean at 90 would see only the high side and read high. Confidence keeps the
 * window unfolded, as RBA-106 calibrates it.
 * @param groups - Every tempo group, so the total counts all votes
 * @param acrossEdge - The octave images of votes the fold may have moved across the range's edge
 * @returns One tempo per group, in the groups' order
 */
function withConfidence(groups: ReadonlyMap<number, Votes>, acrossEdge: ReadonlyMap<number, Votes>): Tempo[] {
  let totalVotes = 0;
  for (const {count} of groups.values()) {
    totalVotes += count;
  }

  return [...groups].map(([tempo, {count}]) => {
    const keys = [tempo - 1, tempo, tempo + 1];
    const window = keys.map(key => groups.get(key));
    const support = window.reduce((sum, votes) => sum + (votes?.count ?? 0), 0);
    const folded = [...window, ...keys.map(key => acrossEdge.get(key))];
    const foldedSupport = folded.reduce((sum, votes) => sum + (votes?.count ?? 0), 0);
    const weightedSum = folded.reduce((sum, votes) => sum + (votes?.weightedSum ?? 0), 0);

    return {
      tempo,
      // A group of zero-count votes has no mean: its whole BPM is all there is
      exact: foldedSupport > 0 ? weightedSum / foldedSupport : tempo,
      count,
      confidence: totalVotes > 0 ? support / totalVotes : 0,
    };
  });
}
