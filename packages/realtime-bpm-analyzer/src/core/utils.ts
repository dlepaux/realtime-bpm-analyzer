import * as consts from './consts';
import type {
  ValidPeaks,
  NextIndexPeaks,
  OnThresholdFunction,
  AggregateData,
} from './types';

/**
 * Rungs are rounded to nine decimals, this scale. Subtracting the step in floats drifts (0.95 - 0.05 is
 * 0.8999999999999999 and the last default rung was 0.19999999999999968), so a rung never equalled the
 * floor it was compared with and stopping on it depended on the drift. Rounded, each rung is the
 * literal it stands for and compares exactly with `minValidThreshold`.
 */
const thresholdDecimals = 1e9;

/**
 * The thresholds from one step under `startThreshold` down to the first one at or under `minValidThreshold`
 * @param minValidThreshold Lowest threshold, included when it falls on a rung
 * @param startThreshold Threshold above the first rung
 * @param thresholdStep Distance between rungs
 * @returns At least one rung, in descending order
 */
function thresholdLadder(
  minValidThreshold: number,
  startThreshold: number,
  thresholdStep: number,
): number[] {
  const rungs: number[] = [];
  // Bounded: the ladder can't hold more rungs than there are steps from the start down to zero
  const maxRungs = Math.max(1, Math.ceil(startThreshold / thresholdStep));

  for (let n = 1; n <= maxRungs; n++) {
    const threshold = Math.round((startThreshold - (n * thresholdStep)) * thresholdDecimals) / thresholdDecimals;
    rungs.push(threshold);

    if (threshold <= minValidThreshold) {
      break;
    }
  }

  return rungs;
}

/**
 * Loop between .9 and minValidThreshold at .2 by default, passing the threshold to the function
 * @param onThreshold Function for each iteration, you must return a boolean, true will exit the loop process
 * @param minValidThreshold minValidThreshold usualy 0.2
 * @param startThreshold startThreshold usualy 0.95
 * @param thresholdStep thresholdStep usuably 0.05
 * @returns A promise that resolves nothing
 */
export async function descendingOverThresholds(
  onThreshold: OnThresholdFunction,
  minValidThreshold = consts.minValidThreshold,
  startThreshold = consts.startThreshold,
  thresholdStep = consts.thresholdStep,
): Promise<void> {
  for (const threshold of thresholdLadder(minValidThreshold, startThreshold, thresholdStep)) {
    const shouldExit = await onThreshold(threshold);
    if (shouldExit) {
      break;
    }
  }
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

  for (const threshold of thresholdLadder(minValidThreshold, startThreshold, thresholdStep)) {
    object[threshold.toString()] = initialValueFactory();
  }

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
  return generateThresholdMap<number[]>(
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
