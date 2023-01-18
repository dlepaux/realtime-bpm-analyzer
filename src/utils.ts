import * as consts from './consts';
import type {Peaks, ValidPeaks, NextIndexPeaks, OnThresholdFunction} from './types';

/**
 * Loop between .9 and minValidThreshold at .3 by default, passoing the threshold to the function
 * @param {OnThresholdFunction} onThreshold Function for each iteration, you must return a boolean, true will exit the lopp process
 * @param {number} minValidThreshold Minimum threshold to count peaks from
 * @return {Promise<void>}
 */
export async function descendingOverThresholds(onThreshold: OnThresholdFunction, minValidThreshold = 0.3): Promise<void> {
  let threshold = consts.startThreshold;

  do {
    threshold -= consts.thresholdStep;
    const shouldExit = await onThreshold(threshold);
    if (shouldExit) {
      break;
    }
  } while (threshold > minValidThreshold);
}

/**
 * Generate an object with keys as thresholds and will containes validPeaks
 * @return {ValidPeaks} Collection of validPeaks by thresholds
 */
export function generateValidPeaksModel(): ValidPeaks {
  const object: Record<string, Peaks> = {};
  let threshold = consts.startThreshold;

  do {
    threshold -= consts.thresholdStep;
    object[threshold.toString()] = [];
  } while (threshold > consts.minValidThreshold);

  return object;
}

/**
 * Generate an object with keys as thresholds and will containes NextIndexPeaks
 * @return {NextIndexPeaks} Collection of NextIndexPeaks by thresholds
 */
export function generateNextIndexPeaksModel(): NextIndexPeaks {
  const object: Record<string, number> = {};
  let threshold = consts.startThreshold;

  do {
    threshold -= consts.thresholdStep;
    object[threshold.toString()] = 0;
  } while (threshold > consts.minValidThreshold);

  return object;
}
