export const realtimeBpmProcessorName = 'realtime-bpm-processor' as const;
export const startThreshold = 0.95;
export const minValidThreshold = 0.2;
export const minPeaks = 15;
export const thresholdStep = 0.05;
export const frequencyValue = 200;
export const qualityValue = 1;

/**
 * Minimum BPM value for tempo normalization
 * @remarks
 * Due to amplitude threshold limitations in the detection algorithm,
 * tempos below this value are doubled to fit within the detectable range.
 */
export const minBpmRange = 90;

/**
 * Maximum BPM value for tempo normalization
 * @remarks
 * Due to amplitude threshold limitations in the detection algorithm,
 * tempos above this value are halved to fit within the detectable range.
 */
export const maxBpmRange = 180;

/**
 * Duration in seconds to skip after detecting a peak
 * @remarks
 * This prevents detecting the same peak multiple times during its decay phase.
 * 0.25 seconds is approximately the minimum time between distinct beats at high tempos.
 */
export const peakSkipDuration = 0.25;

/**
 * Maximum number of interval comparisons per peak
 * @remarks
 * When analyzing intervals between peaks, we compare each peak with the next N peaks.
 * This limits computational complexity while capturing sufficient tempo information.
 */
export const maxIntervalComparisons = 10;

/**
 * Default buffer size for chunk aggregation
 * @remarks
 * Audio data is aggregated into chunks of this size before analysis.
 * Larger values provide more context but increase latency.
 */
export const defaultBufferSize = 4096;
