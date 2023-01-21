import * as consts from './consts';
import type {Peaks, ValidPeaks, NextIndexPeaks, OnThresholdFunction} from './types';

/**
 * Loop between .9 and minValidThreshold at .3 by default, passoing the threshold to the function
 * @param {OnThresholdFunction} onThreshold Function for each iteration, you must return a boolean, true will exit the lopp process
 * @param {number} minValidThreshold Minimum threshold to count peaks from
 * @return {Promise<void>}
 */
export async function descendingOverThresholds(onThreshold: OnThresholdFunction, startThreshold = consts.startThreshold, thresholdStep = consts.thresholdStep, minValidThreshold = consts.minValidThreshold): Promise<void> {
  let threshold = startThreshold;

  do {
    threshold -= thresholdStep;
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
export function generateValidPeaksModel(startThreshold = consts.startThreshold, thresholdStep = consts.thresholdStep, minValidThreshold = consts.minValidThreshold): ValidPeaks {
  const object: Record<string, Peaks> = {};
  let threshold = startThreshold;

  do {
    threshold -= thresholdStep;
    object[threshold.toString()] = [];
  } while (threshold > minValidThreshold);

  return object;
}

/**
 * Generate an object with keys as thresholds and will containes NextIndexPeaks
 * @return {NextIndexPeaks} Collection of NextIndexPeaks by thresholds
 */
export function generateNextIndexPeaksModel(startThreshold = consts.startThreshold, thresholdStep = consts.thresholdStep, minValidThreshold = consts.minValidThreshold): NextIndexPeaks {
  const object: Record<string, number> = {};
  let threshold = startThreshold;

  do {
    threshold -= thresholdStep;
    object[threshold.toString()] = 0;
  } while (threshold > minValidThreshold);

  return object;
}
