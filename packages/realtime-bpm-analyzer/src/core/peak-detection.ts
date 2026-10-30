import {descendingOverThresholds} from './utils';
import type {
  Peaks,
  PeaksAndThreshold,
  AnalyzerFindPeaksOptions,
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
  if (threshold < 0 || threshold > 1) {
    throw new Error(
      'Invalid threshold: '
        + threshold
        + '. Threshold must be between 0 and 1.',
    );
  }

  if (audioSampleRate <= 0) {
    throw new Error(
      'Invalid sample rate: '
        + audioSampleRate
        + '. Sample rate must be positive.',
    );
  }

  const peaks: Peaks = [];
  const skipForwardIndexes = utils.computeIndexesToSkip(
    consts.peakSkipDuration,
    audioSampleRate,
  );

  const {length} = data;

  /**
   * Identify peaks that are greater than the threshold, adding them to the collection
   */
  for (let i = offset; i < length; i += 1) {
    if (data[i] > threshold) {
      peaks.push(i);

      // Skip forward ~0.25s to pass this peak. Subtract 1 because the for-loop
      // will also increment i on the next iteration; without this adjustment
      // we would actually skip skipForwardIndexes+1 samples per peak.
      i += skipForwardIndexes - 1;
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
  if (audioSampleRate <= 0) {
    throw new Error(
      `Invalid sample rate: ${audioSampleRate}. Sample rate must be positive.`,
    );
  }

  if (!channelData || channelData.length === 0) {
    throw new Error('Invalid channel data: buffer is empty or undefined.');
  }

  let validPeaks: Peaks = [];
  let validThreshold = 0;

  await descendingOverThresholds(async threshold => {
    const {peaks} = findPeaksAtThreshold({
      audioSampleRate,
      data: channelData,
      threshold,
    });

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
