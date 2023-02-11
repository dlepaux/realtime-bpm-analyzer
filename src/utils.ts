import * as consts from './consts';
import type {Peaks, ValidPeaks, NextIndexPeaks, OnThresholdFunction, AggregateData} from './types';

/**
 * Loop between .9 and minValidThreshold at .3 by default, passoing the threshold to the function
 * @param {OnThresholdFunction} onThreshold Function for each iteration, you must return a boolean, true will exit the loop process
 * @param {number} minValidThreshold minValidThreshold usualy 0.3
 * @param {number} startThreshold startThreshold usualy 0.9
 * @param {number} thresholdStep thresholdStep usuably 0.05
 * @return {Promise<void>}
 */
export async function descendingOverThresholds(onThreshold: OnThresholdFunction, minValidThreshold = consts.minValidThreshold, startThreshold = consts.startThreshold, thresholdStep = consts.thresholdStep): Promise<void> {
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
 * @param {number} minValidThreshold minValidThreshold usualy 0.3
 * @param {number} startThreshold startThreshold usualy 0.9
 * @param {number} thresholdStep thresholdStep usuably 0.05
 * @return {ValidPeaks} Collection of validPeaks by thresholds
 */
export function generateValidPeaksModel(minValidThreshold = consts.minValidThreshold, startThreshold = consts.startThreshold, thresholdStep = consts.thresholdStep): ValidPeaks {
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
export function generateNextIndexPeaksModel(minValidThreshold = consts.minValidThreshold, startThreshold = consts.startThreshold, thresholdStep = consts.thresholdStep): NextIndexPeaks {
  const object: Record<string, number> = {};
  let threshold = startThreshold;

  do {
    threshold -= thresholdStep;
    object[threshold.toString()] = 0;
  } while (threshold > minValidThreshold);

  return object;
}

export function chunckAggregator(): (pcmData: Float32Array) => AggregateData {
  const bufferSize = 4096;

  /**
   * Track the current buffer fill level
   */
  let _bytesWritten = 0;

  /**
   * Create a buffer of fixed size
   */
  const _buffer: Float32Array = new Float32Array();

  function initBuffer(): void {
    _bytesWritten = 0;
  }

  function isBufferFull(): boolean {
    return _bytesWritten === bufferSize;
  }

  function flush(): void {
    initBuffer();
  }

  return function (pcmData: Float32Array): AggregateData {
    if (isBufferFull()) {
      flush();
    }

    const mergedArray = new Float32Array(_buffer.length + pcmData.length);
    mergedArray.set(_buffer, 0);
    mergedArray.set(pcmData, _buffer.length);
    _bytesWritten += pcmData.length;

    return {
      isBufferFull: isBufferFull(),
      _buffer,
      bufferSize,
    };
  };
}
