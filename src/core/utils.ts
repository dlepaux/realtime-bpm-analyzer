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
 * Generic helper to generate a threshold-indexed map
 * @param initialValue The initial value for each threshold key
 * @param minValidThreshold Minimum threshold (default: 0.2)
 * @param startThreshold Starting threshold (default: 0.95)
 * @param thresholdStep Step size between thresholds (default: 0.05)
 * @returns Object with threshold strings as keys and initialValue as values
 */
function generateThresholdMap<T>(initialValue: T, minValidThreshold = consts.minValidThreshold, startThreshold = consts.startThreshold, thresholdStep = consts.thresholdStep): Record<string, T> {
  const object: Record<string, T> = {};
  let threshold = startThreshold;

  do {
    threshold -= thresholdStep;
    // Use toFixed to handle floating point precision issues (e.g., 0.7499999 -> "0.75")
    object[threshold.toFixed(2)] = initialValue;
  } while (threshold > minValidThreshold);

  return object;
}

/**
 * Generate an object with keys as thresholds and will containes validPeaks
 * @param minValidThreshold minValidThreshold usualy 0.2
 * @param startThreshold startThreshold usualy 0.9
 * @param thresholdStep thresholdStep usuably 0.05
 * @returns Collection of validPeaks by thresholds
 */
export function generateValidPeaksModel(minValidThreshold = consts.minValidThreshold, startThreshold = consts.startThreshold, thresholdStep = consts.thresholdStep): ValidPeaks {
  return generateThresholdMap<Peaks>([], minValidThreshold, startThreshold, thresholdStep);
}

/**
 * Generate an object with keys as thresholds and will containes NextIndexPeaks
 * @param minValidThreshold Minimum threshold to reach (we're descending from the startThreshold)
 * @param startThreshold Starting threshold
 * @param thresholdStep Usually 0.05
 * @returns Collection of NextIndexPeaks by thresholds
 */
export function generateNextIndexPeaksModel(minValidThreshold = consts.minValidThreshold, startThreshold = consts.startThreshold, thresholdStep = consts.thresholdStep): NextIndexPeaks {
  return generateThresholdMap<number>(0, minValidThreshold, startThreshold, thresholdStep);
}

/**
 * Creates a function that aggregates incoming PCM data into chunks.
 * @param bufferSize - Size of the buffer to aggregate (default: 4096)
 * @returns A function that accepts PCM data and aggregates it into chunks.
 */
export function chunkAggregator(bufferSize = consts.defaultBufferSize): (pcmData: Float32Array) => AggregateData {
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

/**
 * Computes the number of indexes we need to skip based on sampleRate
 * @param durationSeconds Duration expressed in seconds
 * @param sampleRate Sample rate, typically 48000, 441000, etc
 * @returns The number of indexes we need to skip
 */
export function computeIndexesToSkip(durationSeconds: number, sampleRate: number): number {
  return Math.round(durationSeconds * sampleRate);
}
