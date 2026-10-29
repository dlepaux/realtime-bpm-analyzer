import * as consts from './consts';
import type {
  Peaks,
  ValidPeaks,
  NextIndexPeaks,
  OnThresholdFunction,
  AggregateData,
} from './types';

/**
 * Loop between .9 and minValidThreshold at .2 by default, passing the threshold to the function
 * @param onThreshold Function for each iteration, you must return a boolean, true will exit the loop process
 * @param minValidThreshold minValidThreshold usualy 0.2
 * @param startThreshold startThreshold usualy 0.9
 * @param thresholdStep thresholdStep usuably 0.05
 * @returns A promise that resolves nothing
 */
export async function descendingOverThresholds(
  onThreshold: OnThresholdFunction,
  minValidThreshold = consts.minValidThreshold,
  startThreshold = consts.startThreshold,
  thresholdStep = consts.thresholdStep,
): Promise<void> {
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
 * @param initialValueFactory Function that creates the initial value for each threshold key
 * @param minValidThreshold Minimum threshold (default: 0.2)
 * @param startThreshold Starting threshold (default: 0.95)
 * @param thresholdStep Step size between thresholds (default: 0.05)
 * @returns Object with threshold strings as keys and initialValue as values
 */
function generateThresholdMap<T>(
  initialValueFactory: () => T,
  minValidThreshold = consts.minValidThreshold,
  startThreshold = consts.startThreshold,
  thresholdStep = consts.thresholdStep,
): Record<string, T> {
  const object: Record<string, T> = {};
  let threshold = startThreshold;

  do {
    threshold -= thresholdStep;
    // Use toFixed to handle floating point precision issues (e.g., 0.7499999 -> "0.75")
    object[threshold.toString()] = initialValueFactory();
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
export function generateValidPeaksModel(
  minValidThreshold = consts.minValidThreshold,
  startThreshold = consts.startThreshold,
  thresholdStep = consts.thresholdStep,
): ValidPeaks {
  return generateThresholdMap<Peaks>(
    () => [],
    minValidThreshold,
    startThreshold,
    thresholdStep,
  );
}

/**
 * Generate an object with keys as thresholds and will containes NextIndexPeaks
 * @param minValidThreshold Minimum threshold to reach (we're descending from the startThreshold)
 * @param startThreshold Starting threshold
 * @param thresholdStep Usually 0.05
 * @returns Collection of NextIndexPeaks by thresholds
 */
export function generateNextIndexPeaksModel(
  minValidThreshold = consts.minValidThreshold,
  startThreshold = consts.startThreshold,
  thresholdStep = consts.thresholdStep,
): NextIndexPeaks {
  return generateThresholdMap<number>(
    () => 0,
    minValidThreshold,
    startThreshold,
    thresholdStep,
  );
}

/**
 * Creates a function that aggregates incoming PCM data into chunks.
 * @param bufferSize - Size of the buffer to aggregate (default: 4096)
 * @returns A function that accepts PCM data and aggregates it into chunks.
 */
export function chunkAggregator(
  bufferSize = consts.defaultBufferSize,
): (pcmData: Float32Array) => AggregateData {
  // One allocation for the lifetime of the aggregator. Previous implementation
  // allocated a fresh Float32Array on every call (375+ times/second inside the
  // AudioWorklet callback), producing enough GC pressure to cause audible glitches.
  const buffer = new Float32Array(bufferSize);
  let bytesWritten = 0;

  /**
   * Aggregates incoming PCM data into chunks.
   * @param pcmData - The PCM data to be aggregated.
   * @returns Object containing aggregated data and buffer information.
   */
  return function (pcmData: Float32Array): AggregateData {
    if (bytesWritten >= bufferSize) {
      bytesWritten = 0;
    }

    // Clamp to available space. Oversized chunks would otherwise overshoot the
    // buffer and leave isBufferFull stuck at false (prior bug: `=== bufferSize` check).
    const writable = Math.min(pcmData.length, bufferSize - bytesWritten);
    buffer.set(pcmData.subarray(0, writable), bytesWritten);
    bytesWritten += writable;

    const full = bytesWritten >= bufferSize;

    return {
      isBufferFull: full,
      // Full case: return the shared buffer (safe because RealTimeBpmProcessor's
      // analysisInProgress guard prevents a second analyzeChunk from reading
      // the buffer while a new chunk is being written).
      // Partial case: zero-copy view matching the written length.
      buffer: full ? buffer : buffer.subarray(0, bytesWritten),
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
export function computeIndexesToSkip(
  durationSeconds: number,
  sampleRate: number,
): number {
  return Math.round(durationSeconds * sampleRate);
}
