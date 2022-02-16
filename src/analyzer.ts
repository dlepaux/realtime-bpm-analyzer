import {loopOnThresholds} from './utils';

/**
 * Apply a low pass filter to an AudioBuffer and return the result
 */
export function getLowPassSource(buffer: AudioBuffer): AudioBufferSourceNode {
  const {numberOfChannels, length, sampleRate} = buffer;
  const context = new OfflineAudioContext(numberOfChannels, length, sampleRate);

  /**
   * Create buffer source
   */
  const source: AudioBufferSourceNode = context.createBufferSource();
  source.buffer = buffer;

  /**
   * Create lowpass filter
   */
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';

  /**
   * Pipe the song into the filter, and the filter into the offline context
   */
  source.connect(filter);
  filter.connect(context.destination);

  return source;
}

/**
 * Find peaks when the signal if greater than the threshold, then move 10000 indexes (represents ~0.25s) to ignore the descending phase of the parabol
 * @param {object} data Buffer channel data
 * @param {number} threshold Threshold for qualifying as a peak
 * @param {number} offset Position where we start to loop
 * @return {object[]|undefined} Peaks found that are greater than the threshold
 */

interface PeaksAndThreshold {
  peaks: number[];
  threshold: number;
}

// Source.buffer.getChannelData(0), threshold, offsetForNextPeak
export function findPeaksAtThreshold(data: Float32Array, threshold: number, offset: number): PeaksAndThreshold {
  const peaks = [];

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
 * @param {number} sampleRate Audio sample rate
 */
interface BpmCandidates {
  bpm: Tempo[];
  threshold: number;
}

type Peaks = number[];
export function computeBpm(data: Record<string, Peaks>, sampleRate: number): BpmCandidates {
  /**
   * Minimum peaks
   */
  const minPeaks = 15;

  /**
   * Flag to fix Object.keys looping
   */
  let hasPeaks = false;
  let foundThreshold = 0.3;

  loopOnThresholds((threshold: number, stop: ((bool: boolean) => void) | undefined) => {
    if (hasPeaks && stop) {
      stop(true);
      return;
    }

    if (data[threshold].length > minPeaks) {
      hasPeaks = true;
      foundThreshold = threshold;
    }
  });

  if (hasPeaks && foundThreshold) {
    const intervals = identifyIntervals(data[foundThreshold]);
    const tempos = groupByTempo(sampleRate)(intervals);
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
 * @param {object[]} Candidate (BPMs) with count
 * @return {object[]} Returns the 5 top candidates with highest counts
 */
export function getTopCandidates(candidates: Tempo[]): Tempo[] {
  return candidates.sort((a, b) => (b.count - a.count)).splice(0, 5);
}

/**
 * Identify intervals between peaks
 * @param {array} peaks Array of qualified peaks
 * @return {array} Identifies intervals between peaks
 */
interface Interval {
  interval: number;
  count: number;
}
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
 * Factory for group reducer
 * @param  {number} sampleRate Audio sample rate
 * @return {Function}
 */
export interface Tempo {
  tempo: number;
  count: number;
}

export function groupByTempo(sampleRate: number) {
  /**
   * Figure out best possible tempo candidates
   * @param {array} intervalCounts List of identified intervals
   * @return {array} Intervals grouped with similar values
   */
  return (intervalCounts: Interval[]): Tempo[] => {
    const tempoCounts: Tempo[] = [];

    for (const intervalCount of intervalCounts) {
      if (intervalCount.interval !== 0) {
        intervalCount.interval = Math.abs(intervalCount.interval);

        /**
         * Convert an interval to tempo
         */
        let theoreticalTempo = (60 / (intervalCount.interval / sampleRate));

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
          };

          tempoCounts.push(tempo);
        }
      }
    }

    return tempoCounts;
  };
}
