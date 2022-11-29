import * as consts from './consts';
import type { Peaks } from './types';

/**
 * Loop between .9 and .3 to check peak at each thresholds
 * @param {function} onLoop Function for each iteration
 * @param {mixed} minValidThreshold Function for each iteration
 * @param {mixed} callback Function executed at the end
 */
export function descendingOverThresholds(onLoop: (threshold: number, stop?: (bool: boolean) => void) => void, minValidThreshold = 0.3): Record<string, any[]> {
  let threshold = consts.startThreshold;

  /**
   * Optionnal object to store data
   */
  const object = {};

  /**
   * Loop between 0.90 and 0.30 (theoretically it is 0.90 but it is actually 0.899999, due because of float manipulation)
   */
  do {
    let stop = false;
    threshold -= consts.thresholdStep;
    onLoop(threshold, (bool: boolean) => {
      stop = bool;
    });

    if (stop) {
      break;
    }
  } while (threshold > minValidThreshold);

  return object;
}

/**
 * Generate an object with each keys (thresholds)
 * @return {object} Object with thresholds key initialized with an empty array
 */
export function generateValidPeaksModel(): Record<string, Peaks> {
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
export function generateNextIndexPeaksModel(): Record<string, number> {
  const object: Record<string, number> = {};
  let threshold = consts.startThreshold;

  do {
    threshold -= consts.thresholdStep;
    object[threshold.toString()] = 0;
  } while (threshold > consts.minValidThreshold);

  return object;
}
