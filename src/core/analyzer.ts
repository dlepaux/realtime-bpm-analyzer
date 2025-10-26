import {descendingOverThresholds} from './utils';
import type {
  Peaks,
  PeaksAndThreshold,
  BpmCandidates,
  Interval,
  Tempo,
  Threshold,
  AnalyzerFindPeaksOptions,
  AnalyzerGroupByTempoOptions,
  AnalyzerComputeBpmOptions,
  BiquadFilterOptions,
  AnalyzerFindPeaksAtTheshold,
} from './types';
import * as consts from './consts';
import * as utils from './utils';

/**
 * Find peaks when the signal if greater than the threshold, then move 10_000 indexes (represents ~0.23s) to ignore the descending phase of the parabol
 * @param options - AnalyzerFindPeaksAtTheshold
 * @param options.audioSampleRate - Sample rate
 * @param options.data - Buffer channel data
 * @param options.threshold - Threshold for qualifying as a peak
 * @param options.offset - Position where we start to loop
 * @returns Peaks found that are greater than the threshold
 */
export function findPeaksAtThreshold({
  audioSampleRate,
  data,
  threshold,
  offset = 0,
}: AnalyzerFindPeaksAtTheshold): PeaksAndThreshold {
  const peaks: Peaks = [];
  const skipForwardIndexes = utils.computeIndexesToSkip(0.25, audioSampleRate);

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
 * @param options - AnalyzerFindPeaksOptions
 * @param options.audioSampleRate - Sample rate
 * @param options.channelData - Channel data
 * @returns Suffisent amount of peaks in order to continue further the process
 */
export async function findPeaks({
  audioSampleRate,
  channelData,
}: AnalyzerFindPeaksOptions): Promise<PeaksAndThreshold> {
  let validPeaks: Peaks = [];
  let validThreshold = 0;

  await descendingOverThresholds(async threshold => {
    const {peaks} = findPeaksAtThreshold({audioSampleRate, data: channelData, threshold});

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

/**
 * Helpfull function to create standard and shared lowpass and highpass filters
 * Important Note: The original library wasn't using properly the lowpass filter and it was not applied at all.
 * This method should not be used unitl more research and documented tests will be acheived.
 * @param context - AudioContext instance
 * @param options - Optionnal BiquadFilterOptions
 * @returns BiquadFilterNode
 */
export function getBiquadFilter(context: OfflineAudioContext | AudioContext, options?: BiquadFilterOptions): BiquadFilterNode {
  const lowpass = context.createBiquadFilter();

  lowpass.type = 'lowpass';
  lowpass.frequency.value = options?.frequencyValue ?? consts.frequencyValue;
  lowpass.Q.value = options?.qualityValue ?? consts.qualityValue;

  return lowpass;
}

/**
 * Apply to the source a biquad lowpass filter
 * @param buffer - Audio buffer
 * @param options - Optionnal BiquadFilterOptions
 * @returns A Promise that resolves an AudioBuffer instance
 */
export async function getOfflineLowPassSource(buffer: AudioBuffer, options?: BiquadFilterOptions): Promise<AudioBuffer> {
  const {length, numberOfChannels, sampleRate} = buffer;
  const offlineAudioContext = new OfflineAudioContext(numberOfChannels, length, sampleRate);

  /**
   * Create buffer source
   */
  const source = offlineAudioContext.createBufferSource();
  source.buffer = buffer;

  const lowpass = getBiquadFilter(offlineAudioContext, options);

  /**
   * Pipe the song into the filter, and the filter into the offline context
   */
  source.connect(lowpass);
  lowpass.connect(offlineAudioContext.destination);

  source.start(0);

  const audioBuffer = await offlineAudioContext.startRendering();

  return audioBuffer;
}

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

    if (data[threshold].length > minPeaks) {
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
  return candidates.sort((a, b) => (b.count - a.count)).splice(0, length);
}

/**
 * Gets the top candidate from the array
 * @param candidates - BPMs with counts.
 * @returns Returns the top candidate with the highest count.
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
 * @param peaks - Array of qualified bass peaks
 * @returns Return a collection of intervals between peaks
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

/**
 * Fastest way to detect the BPM from an AudioBuffer
 * @param originalBuffer - AudioBuffer
 * @param options - BiquadFilterOptions
 * @returns Returns the best candidates
 */
export async function analyzeFullBuffer(originalBuffer: AudioBuffer, options?: BiquadFilterOptions): Promise<Tempo[]> {
  const buffer = await getOfflineLowPassSource(originalBuffer, options);
  const channelData = buffer.getChannelData(0);
  const {peaks} = await findPeaks({audioSampleRate: buffer.sampleRate, channelData});
  const intervals = identifyIntervals(peaks);
  const tempos = groupByTempo({audioSampleRate: buffer.sampleRate, intervalCounts: intervals});
  const topCandidates = getTopCandidates(tempos);

  return topCandidates;
}
