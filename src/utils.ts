import * as consts from './consts';
import type { Peaks, ValidPeaks, NextIndexPeaks, OnThresholdFunction } from './types';

/**
 * Loop between .9 and .3 to check peak at each thresholds
 * @param {function} onThreshold Function for each iteration, you must return a boolean, true will exit the lopp process
 * @param {mixed} minValidThreshold Function for each iteration
 * @param {mixed} callback Function executed at the end
 */
export async function descendingOverThresholds(onThreshold: OnThresholdFunction, minValidThreshold = 0.3): Promise<void> {
  let threshold = consts.startThreshold;

  /**
   * Loop between 0.90 and 0.30 (theoretically it is 0.90 but it is actually 0.899999, due because of float manipulation)
   */
  do {
    threshold -= consts.thresholdStep;
    const shouldExit = await onThreshold(threshold);
    if (shouldExit) {
      break;
    }
  } while (threshold > minValidThreshold);
}

/**
 * Generate an object with each keys (thresholds)
 * @return {object} Object with thresholds key initialized with an empty array
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
 * Generate an object with each keys (thresholds)
 * @return {object} Object with thresholds key initialized at 0
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
