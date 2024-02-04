import * as consts from './consts';
import type {Peaks, ValidPeaks, NextIndexPeaks, OnThresholdFunction, AggregateData} from './types';

/**
 * Loop between .9 and minValidThreshold at .2 by default, passing the threshold to the function
 * @param onThreshold Function for each iteration, you must return a boolean, true will exit the loop process
 * @param minValidThreshold minValidThreshold usualy 0.2
 * @param startThreshold startThreshold usualy 0.9
 * @param thresholdStep thresholdStep usuably 0.05
 * @returns A promise that resolves nothing
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
 * @param minValidThreshold minValidThreshold usualy 0.2
 * @param startThreshold startThreshold usualy 0.9
 * @param thresholdStep thresholdStep usuably 0.05
 * @returns Collection of validPeaks by thresholds
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
 * @param minValidThreshold Minimum threshold to reach (we're descending from the startThreshold)
 * @param startThreshold Starting threshold
 * @param thresholdStep Usually 0.05
 * @returns Collection of NextIndexPeaks by thresholds
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

/**
 * Creates a function that aggregates incoming PCM data into chunks.
 * @returns A function that accepts PCM data and aggregates it into chunks.
 */
export function chunckAggregator(): (pcmData: Float32Array) => AggregateData {
  const bufferSize = 4096;

  /**
   * Track the current buffer fill level.
   */
  let _bytesWritten = 0;

  /**
   * Create a buffer of fixed size.
   */
  let buffer: Float32Array = new Float32Array(0);

  /**
   * Initialize the buffer.
   */
  function initBuffer(): void {
    _bytesWritten = 0;
    buffer = new Float32Array(0);
  }

  /**
   * Checks if the buffer is full.
   * @returns True if the buffer is full, otherwise false.
   */
  function isBufferFull(): boolean {
    return _bytesWritten === bufferSize;
  }

  /**
   * Flushes the buffer.
   */
  function flush(): void {
    initBuffer();
  }

  /**
   * Aggregates incoming PCM data into chunks.
   * @param pcmData - The PCM data to be aggregated.
   * @returns Object containing aggregated data and buffer information.
   */
  return function (pcmData: Float32Array): AggregateData {
    if (isBufferFull()) {
      flush();
    }

    const newBuffer = new Float32Array(buffer.length + pcmData.length);
    newBuffer.set(buffer, 0);
    newBuffer.set(pcmData, buffer.length);
    buffer = newBuffer;
    _bytesWritten += pcmData.length;

    return {
      isBufferFull: isBufferFull(),
      buffer,
      bufferSize,
    };
  };
}
