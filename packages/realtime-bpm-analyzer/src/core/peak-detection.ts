import {descendingOverThresholds} from './utils';
import type {
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

  const peaks: number[] = [];
  const skipForwardIndexes = utils.computeIndexesToSkip(
    consts.peakSkipDuration,
    audioSampleRate,
  );

  // Every pass of the loop below moves i on by at least one sample only while the skip is a whole sample or more, so
  // this bounds the loop to `length` passes. Under 2 Hz the skip rounds to 0 and the same peak would be found forever
  if (!(skipForwardIndexes >= 1)) {
    throw new RangeError(
      `Invalid sample rate: ${audioSampleRate}. The peaks engine needs at least ${consts.peaksMinSampleRate} Hz, `
        + 'where the skip after a peak is a whole sample.',
    );
  }

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

  let validPeaks: number[] = [];
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

/**
 * The level of a channel's loudest beats, which one click or clipped transient can't set
 * @param data Lowpassed PCM samples
 * @param audioSampleRate Sample rate in Hz, at least {@link consts.peaksMinSampleRate}
 * @returns The `levelPercentile` of the channel's maxima per `peakSkipDuration` window, 0 for silence
 * @remarks Only positive samples count, since `findPeaksAtThreshold` compares signed samples. A sample that is NaN is
 * skipped, since no comparison with it holds, so it never sets the level. An infinite one counts: when the level lands
 * on it, the level is past full scale and `findPeaksRelativeToLevel` searches nothing.
 */
export function levelReference(data: Float32Array, audioSampleRate: number): number {
  const window = utils.computeIndexesToSkip(consts.peakSkipDuration, audioSampleRate);

  // findPeaksAtThreshold refuses such a rate before the file path ever gets here: kept so no window is empty
  if (!(window >= 1)) {
    throw new RangeError(`Invalid sample rate: ${audioSampleRate}. The peaks engine needs at least ${consts.peaksMinSampleRate} Hz.`);
  }

  const count = Math.ceil(data.length / window);
  // Each maximum is a sample or 0, so 32-bit storage holds it exactly
  const maxima = new Float32Array(count);

  for (let w = 0; w < count; w += 1) {
    const end = Math.min(data.length, (w + 1) * window);
    let maximum = 0;

    for (let i = w * window; i < end; i += 1) {
      if (data[i] > maximum) {
        maximum = data[i];
      }
    }

    maxima[w] = maximum;
  }

  if (count === 0) {
    return 0;
  }

  maxima.sort();

  return maxima[Math.floor(((count - 1) * consts.levelPercentile) / 100)];
}

/**
 * The fixed ladder run again, every rung scaled by the channel's own level, so a quiet or bass-light file is searched
 * the way a full-scale one is
 * @param options - AnalyzerFindPeaksOptions
 * @param options.audioSampleRate - Sample rate
 * @param options.channelData - Lowpassed channel data
 * @returns The peaks of the first scaled rung with enough of them, with that rung's threshold. None when the level is
 * under `silenceFloor`, or at full scale or above, where the fixed ladder already was this search
 * @remarks Only `detectTempo` calls it, and only once `findPeaks` found nothing: it is the fallback, not a
 * replacement, so no reading the fixed ladder finds can change.
 */
export async function findPeaksRelativeToLevel({
  audioSampleRate,
  channelData,
}: AnalyzerFindPeaksOptions): Promise<PeaksAndThreshold> {
  const level = levelReference(channelData, audioSampleRate);

  // Written so a NaN level also finds nothing, instead of scaling every rung to NaN
  if (!(level >= consts.silenceFloor && level < 1)) {
    return {peaks: [], threshold: 0};
  }

  let validPeaks: number[] = [];
  let validThreshold = 0;

  await descendingOverThresholds(async rung => {
    // The product stays a double, as the fixed rungs are: findPeaksAtThreshold compares each sample with it in double
    const {peaks, threshold} = findPeaksAtThreshold({
      audioSampleRate,
      data: channelData,
      threshold: rung * level,
    });

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
