import {descendingOverThresholds} from './utils';
import type {
  Peaks,
  BpmCandidates,
  BpmProgress,
  Interval,
  Detector,
  Tempo,
  Threshold,
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
}: AnalyzerComputeBpmOptions): Promise<BpmCandidates> {
  /**
   * Flag to fix Object.keys looping
   */
  let hasPeaks = false;
  let foundThreshold = consts.minValidThreshold;

  await descendingOverThresholds(async (threshold: Threshold) => {
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

    const bpmCandidates: BpmCandidates = {
      bpm: candidates,
      threshold: foundThreshold,
    };

    return bpmCandidates;
  }

  return {
    bpm: [],
    threshold: foundThreshold,
  };
}

/**
 * Measure how close the valid peaks are to a first BPM result
 * @param data - Valid peaks by threshold
 * @returns The best-filled threshold's peak count, capped at the count `computeBpm` needs
 */
export function computeProgress(data: ValidPeaks): BpmProgress {
  // computeBpm succeeds as soon as any threshold is full, so the fullest one is the progress
  const mostPeaks = Math.max(0, ...Object.values(data).map(peaks => peaks.length));

  return {
    peaks: Math.min(mostPeaks, consts.requiredPeaks),
    requiredPeaks: consts.requiredPeaks,
  };
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
export function identifyIntervals(peaks: Peaks): Interval[] {
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
 * Validate a caller-supplied detector, or return the default
 * @param detector - Detector from the caller's options
 * @returns A known detector
 * @throws {RangeError} When the detector is unknown
 */
export function resolveDetector(detector?: Detector): Detector {
  if (detector === undefined || detector === 'peaks' || detector === 'tempogram') {
    return detector ?? 'peaks';
  }

  throw new RangeError(`Invalid detector: ${String(detector)}. Use 'peaks' or 'tempogram'.`);
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
  const tempoCounts: Tempo[] = [];

  for (const intervalCount of intervalCounts) {
    /**
     * Skip if interval is equal 0
     */
    if (intervalCount.interval === 0) {
      continue;
    }

    // Use local variable to avoid mutating input parameter
    const absoluteInterval = Math.abs(intervalCount.interval);

    /**
     * Convert an interval to tempo
     */
    let theoreticalTempo = 60 / (absoluteInterval / audioSampleRate);

    /**
     * Fold the tempo by octaves into the range (90-180 BPM by default)
     */
    while (theoreticalTempo < min) {
      theoreticalTempo *= 2;
    }

    while (theoreticalTempo > max) {
      theoreticalTempo /= 2;
    }

    /**
     * Round to legible integer
     */
    theoreticalTempo = Math.round(theoreticalTempo);

    /**
     * See if another interval resolved to the same tempo
     */
    let foundTempo = tempoCounts.find(
      (tempoCount: Tempo) => tempoCount.tempo === theoreticalTempo,
    );

    if (foundTempo) {
      // Create new object with aggregated count (immutable update)
      const index = tempoCounts.indexOf(foundTempo);
      tempoCounts[index] = {
        tempo: foundTempo.tempo,
        count: foundTempo.count + intervalCount.count,
        confidence: foundTempo.confidence,
      };
      foundTempo = tempoCounts[index];
    }

    /**
     * Add a unique tempo to the collection
     */
    if (!foundTempo) {
      const tempo: Tempo = {
        tempo: theoreticalTempo,
        count: intervalCount.count,
        confidence: 0,
      };

      tempoCounts.push(tempo);
    }
  }

  return withConfidence(tempoCounts);
}

/**
 * Set each tempo's confidence: its ±1 BPM support over all votes (RBA-12 proposal v1).
 * Pooling neighbours absorbs rounding jitter, since a true 128 splits its votes over 127–129.
 * @param tempos - Every tempo group, so the total counts all votes
 * @returns New tempo objects in the same order
 */
function withConfidence(tempos: Tempo[]): Tempo[] {
  const countByTempo = new Map(tempos.map(t => [t.tempo, t.count]));
  const totalVotes = tempos.reduce((sum, t) => sum + t.count, 0);

  return tempos.map(t => {
    const support = (countByTempo.get(t.tempo - 1) ?? 0)
      + t.count
      + (countByTempo.get(t.tempo + 1) ?? 0);

    return {
      tempo: t.tempo,
      count: t.count,
      confidence: totalVotes > 0 ? support / totalVotes : 0,
    };
  });
}
