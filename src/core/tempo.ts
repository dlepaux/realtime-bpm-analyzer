import {descendingOverThresholds} from './utils';
import type {
  Peaks,
  BpmCandidates,
  Interval,
  Tempo,
  Threshold,
  AnalyzerGroupByTempoOptions,
  AnalyzerComputeBpmOptions,
} from './types';
import * as consts from './consts';

/**
 * Return the computed bpm from data
 * @param options - AnalyzerComputeBpmOptions
 * @param options.data - Contain valid peaks
 * @param options.audioSampleRate - Audio sample rate
 * @returns A Promise that resolves BPM Candidates
 */
export async function computeBpm({
  audioSampleRate,
  data,
}: AnalyzerComputeBpmOptions): Promise<BpmCandidates> {
  const minPeaks = consts.minPeaks;

  /**
   * Flag to fix Object.keys looping
   */
  let hasPeaks = false;
  let foundThreshold = consts.minValidThreshold;

  await descendingOverThresholds(async (threshold: Threshold) => {
    if (hasPeaks) {
      return true;
    }

    if (data[threshold] && data[threshold].length > minPeaks) {
      hasPeaks = true;
      foundThreshold = threshold;
    }

    return false;
  });

  if (hasPeaks && foundThreshold) {
    const intervals = identifyIntervals(data[foundThreshold]);
    const tempos = groupByTempo({audioSampleRate, intervalCounts: intervals});
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
 * Figure out best possible tempo candidates
 * @param options - AnalyzerGroupByTempoOptions
 * @param options.audioSampleRate - Audio sample rate
 * @param options.intervalCounts - List of identified intervals
 * @returns Intervals grouped with similar values
 */
export function groupByTempo({
  audioSampleRate,
  intervalCounts,
}: AnalyzerGroupByTempoOptions): Tempo[] {
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
     * Adjust the tempo to fit within the 90-180 BPM range
     */
    while (theoreticalTempo < consts.minBpmRange) {
      theoreticalTempo *= 2;
    }

    while (theoreticalTempo > consts.maxBpmRange) {
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

  return tempoCounts;
}
