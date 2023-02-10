import {descendingOverThresholds} from './utils';
import type {Peaks, ValidPeaks, PeaksAndThreshold, BpmCandidates, Interval, Tempo, Threshold, Group} from './types';
import * as consts from './consts';

/**
 * Find peaks when the signal if greater than the threshold, then move 10_000 indexes (represents ~0.23s) to ignore the descending phase of the parabol
 * @param {Float32Array} data Buffer channel data
 * @param {number} threshold Threshold for qualifying as a peak
 * @param {number} offset Position where we start to loop
 * @param {number} skipForwardIndexes Numbers of index to skip when a peak is detected
 * @return {PeaksAndThreshold} Peaks found that are greater than the threshold
 */
export function findPeaksAtThreshold(data: Float32Array, threshold: Threshold, offset = 0, skipForwardIndexes = consts.skipForwardIndexes): PeaksAndThreshold {
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
      i += skipForwardIndexes;
    }
  }

  return {
    peaks,
    threshold,
  };
}

/**
 * Find the minimum amount of peaks from top to bottom threshold, it's necessary to analyze at least 10seconds at 90bpm
 * @param {Float32Array} channelData Channel data
 * @returns {Promise<PeaksAndThreshold>} Suffisent amount of peaks in order to continue further the process
 */
export async function findPeaks(channelData: Float32Array): Promise<PeaksAndThreshold> {
  let validPeaks: Peaks = [];
  let validThreshold = 0;

  await descendingOverThresholds(async threshold => {
    const {peaks} = findPeaksAtThreshold(channelData, threshold);

    /**
     * Loop over peaks
     */
    if (peaks.length < consts.minPeaks) {
      return false;
    }

    validPeaks = peaks;
    validThreshold = threshold;

    return true;
  });

  return {
    peaks: validPeaks,
    threshold: validThreshold,
  };
}

// Type MaxInterval = {
//   position: number;
//   volume: number;
// };

// export function getPeaks(data: Float32Array[], sampleRate: number): MaxInterval[] {
//   // What we're going to do here, is to divide up our audio into parts.

//   // We will then identify, for each part, what the loudest sample is in that
//   // part.

//   // It's implied that that sample would represent the most likely 'beat'
//   // within that part.

//   // Each part is 0.5 seconds long - or 22,050 samples.

//   // This will give us 60 'beats' - we will only take the loudest half of
//   // those.

//   // This will allow us to ignore breaks, and allow us to address tracks with
//   // a BPM below 120.

//   // const partSize = 22050;
//   const partSize = sampleRate / 2;
//   console.log('partSize, 22050', partSize, 'sampleRate', sampleRate);
//   const parts = data[0].length / partSize;
//   let peaks: MaxInterval[] = [];

//   for (let i = 0; i < parts; i++) {
//     let max: number | MaxInterval = 0;
//     for (let j = i * partSize; j < (i + 1) * partSize; j++) {
//       const volume = Math.max(Math.abs(data[0][j]), Math.abs(data[1][j]));
//       if (typeof max === 'number' || (volume > max.volume)) {
//         max = {
//           position: j,
//           volume,
//         };
//       }
//     }

//     if (typeof max !== 'number') {
//       peaks.push(max);
//     }
//   }

//   // We then sort the peaks according to volume...

//   peaks.sort((a, b) => b.volume - a.volume);

//   // ...take the loundest half of those...

//   peaks = peaks.splice(0, peaks.length * 0.5);

//   // ...and re-sort it back based on position.

//   peaks.sort((a, b) => a.position - b.position);

//   return peaks;
// }

// export function getIntervals(peaks: MaxInterval[]): Group[] {
//   // What we now do is get all of our peaks, and then measure the distance to
//   // other peaks, to create intervals.  Then based on the distance between
//   // those peaks (the distance of the intervals) we can calculate the BPM of
//   // that particular interval.

//   // The interval that is seen the most should have the BPM that corresponds
//   // to the track itself.

//   const groups: Group[] = [];

//   for (let index = 0; index < peaks.length; index++) {
//     const peak = peaks[index];
//     for (let i = 1; (index + i) < peaks.length && i < 10; i++) {
//       const group: Group = {
//         tempo: (60 * 44100) / (peaks[index + i].position - peak.position),
//         count: 1,
//       };

//       while (group.tempo < 90) {
//         group.tempo *= 2;
//       }

//       while (group.tempo > 180) {
//         group.tempo /= 2;
//       }

//       group.tempo = Math.round(group.tempo);

//       if (!(groups.some(interval => (interval.tempo === group.tempo ? interval.count++ : 0)))) {
//         groups.push(group);
//       }
//     }
//   }

//   return groups;
// }

// export function getTop(groups: Group[]): Group[] {
//   return groups.sort(function(intA, intB) {
//     return intB.count - intA.count;
//   }).splice(0, 5);
// };

// export function getNewAlgorithmBPM(audioBuffer: AudioBuffer) {
//   const peaks = getPeaks([audioBuffer.getChannelData(0), audioBuffer.getChannelData(1)], audioBuffer.sampleRate);
//   console.log('peaks', peaks);
//   const groups = getIntervals(peaks);
//   console.log('groups', groups);
//   const tops = getTop(groups);
//   return tops;
// }

/**
 * Apply to the source a biquad lowpass filter
 * @param {AudioBuffer} buffer Audio buffer
 * @returns {AudioBufferSourceNode}
 */
export async function getOfflineLowPassSource(buffer: AudioBuffer): Promise<AudioBuffer> {
  const {length, numberOfChannels, sampleRate} = buffer;
  const context = new OfflineAudioContext(numberOfChannels, length, sampleRate);

  /**
   * Create buffer source
   */
  const source = context.createBufferSource();
  source.buffer = buffer;

  /**
   * Create filter
   */
  const lowpass = context.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = consts.offlineLowPassFrequencyValue;
  lowpass.Q.value = consts.offlineLowPassQualityValue;

  const highpass = context.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = consts.offlineHighPassFrequencyValue;
  highpass.Q.value = consts.offlineHighPassQualityValue;

  /**
   * Pipe the song into the filter, and the filter into the offline context
   */
  source.connect(lowpass);
  source.connect(highpass);
  lowpass.connect(highpass);
  highpass.connect(context.destination);

  source.start(0);

  const audioBuffer = await context.startRendering();

  return audioBuffer;
}

/**
 * Return the computed bpm from data
 * @param {Record<string, number[]>} data Contain valid peaks
 * @param {number} audioSampleRate Audio sample rate
 */
export async function computeBpm(data: ValidPeaks, audioSampleRate: number, minPeaks = consts.minPeaks): Promise<BpmCandidates> {
  /**
   * Flag to fix Object.keys looping
   */
  let hasPeaks = false;
  let foundThreshold = consts.minValidThreshold;

  await descendingOverThresholds(async (threshold: Threshold) => {
    if (hasPeaks) {
      return true;
    }

    if (data[threshold].length > minPeaks) {
      hasPeaks = true;
      foundThreshold = threshold;
    }

    return false;
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
    // Console.warn(new Error('Could not find enough samples for a reliable detection.'));
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

  const [first] = candidates.sort((a, b) => (b.count - a.count));

  return first.tempo;
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
