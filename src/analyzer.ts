import {descendingOverThresholds} from './utils';
import * as consts from './consts';
import type {Peaks, PeaksAndThreshold, BpmCandidates, Interval, Tempo, Threshold} from './types';

/**
 * Find peaks when the signal if greater than the threshold, then move 10_000 indexes (represents ~0.25s) to ignore the descending phase of the parabol
 * @param {Float32Array} data Buffer channel data
 * @param {number} threshold Threshold for qualifying as a peak
 * @param {number} offset Position where we start to loop
 * @return {PeaksAndThreshold} Peaks found that are greater than the threshold
 */
export function findPeaksAtThreshold(data: Float32Array, threshold: Threshold, offset = 0): PeaksAndThreshold {
  const peaks: Peaks = [];

  const {length} = data;

  /**
   * Identify peaks that are greater than the threshold, adding them to the collection
   */
  for (let i = offset; i < length; i += 1) {
    if (data[i] > threshold) {
      peaks.push(i);

      /**
       * Skip forward ~0.25s to pass this peak
       */
      i += 10000;
    }
  }

  return {
    peaks,
    threshold,
  };
}

/**
 * Return the computed bpm from data
 * @param {Record<string, number[]>} data Contain valid peaks
 * @param {number} audioSampleRate Audio sample rate
 */
export async function computeBpm(data: Record<string, Peaks>, audioSampleRate: number, minPeaks = 14): Promise<BpmCandidates> {
  /**
   * Flag to fix Object.keys looping
   */
  let hasPeaks = false;
  let foundThreshold = 0.3;

  await descendingOverThresholds(async (threshold: Threshold) => {
    if (hasPeaks) {
      return true;
    }

    if (data[threshold].length > minPeaks) {
      hasPeaks = true;
      foundThreshold = threshold;
    }
  });

  if (hasPeaks && foundThreshold) {
    const intervals = identifyIntervals(data[foundThreshold]);
    const tempos = groupByTempo(audioSampleRate, intervals);
    const candidates = getTopCandidates(tempos);

    const bpmCandidates: BpmCandidates = {
      bpm: candidates,
      threshold: foundThreshold,
    };

    return bpmCandidates;
  }

  if (!hasPeaks) {
    console.warn(new Error('Could not find enough samples for a reliable detection.'));
  }

  return {
    bpm: [],
    threshold: foundThreshold,
  };
}

/**
 * Sort results by count and return top candidate
 * @param {Tempo[]} candidates (BPMs) with count
 * @param {number} length Amount of returned candidates (default: 5)
 * @return {Tempo[]} Returns the 5 top candidates with highest counts
 */
export function getTopCandidates(candidates: Tempo[], length = 5): Tempo[] {
  return candidates.sort((a, b) => (b.count - a.count)).splice(0, length);
}

/**
 * Gets the top candidate from the array
 * @param {Tempo[]} candidates - (BPMs) with counts.
 * @returns {number} - Returns the top candidate with the highest count.
 */
export function getTopCandidate(candidates: Tempo[]): number {
  if (candidates.length === 0) {
    throw new Error('Could not find enough samples for a reliable detection.');
  }

  return candidates.sort((a, b) => (b.count - a.count))[0].tempo;
}

/**
 * Identify intervals between bass peaks
 * @param {array} peaks Array of qualified bass peaks
 * @return {array} Return a collection of intervals between peaks
 */
export function identifyIntervals(peaks: Peaks): Interval[] {
  const intervals: Interval[] = [];

  for (let n = 0; n < peaks.length; n++) {
    for (let i = 0; i < 10; i++) {
      const peak = peaks[n];
      const peakIndex = n + i;
      const interval = peaks[peakIndex] - peak;

      /**
       * Try and find a matching interval and increase it's count
       */
      const foundInterval = intervals.some((intervalCount: Interval) => {
        if (intervalCount.interval === interval) {
          intervalCount.count += 1;
          return intervalCount.count;
        }

        return false;
      });

      /**
       * Add the interval to the collection if it's unique
       */
      if (!foundInterval) {
        const item: Interval = {
          interval,
          count: 1,
        };
        intervals.push(item);
      }
    }
  }

  return intervals;
}

/**
 * Figure out best possible tempo candidates
 * @param  {number} audioSampleRate Audio sample rate
 * @param  {Interval[]} intervalCounts List of identified intervals
 * @return {Tempo[]} Intervals grouped with similar values
 */
export function groupByTempo(audioSampleRate: number, intervalCounts: Interval[]): Tempo[] {
  const tempoCounts: Tempo[] = [];

  for (const intervalCount of intervalCounts) {
    /**
     * Skip if interval is equal 0
     */
    if (intervalCount.interval === 0) {
      continue;
    }

    intervalCount.interval = Math.abs(intervalCount.interval);

    /**
     * Convert an interval to tempo
     */
    let theoreticalTempo = (60 / (intervalCount.interval / audioSampleRate));

    /**
     * Adjust the tempo to fit within the 90-180 BPM range
     */
    while (theoreticalTempo < 90) {
      theoreticalTempo *= 2;
    }

    while (theoreticalTempo > 180) {
      theoreticalTempo /= 2;
    }

    /**
     * Round to legible integer
     */
    theoreticalTempo = Math.round(theoreticalTempo);

    /**
     * See if another interval resolved to the same tempo
     */
    const foundTempo: boolean = tempoCounts.some((tempoCount: Tempo) => {
      if (tempoCount.tempo === theoreticalTempo) {
        tempoCount.count += intervalCount.count;
        return tempoCount.count;
      }

      return false;
    });

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
