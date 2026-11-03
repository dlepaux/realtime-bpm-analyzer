export const realtimeBpmProcessorName = 'realtime-bpm-processor' as const;
export const startThreshold = 0.95;
export const minValidThreshold = 0.2;
export const minPeaks = 15;
/**
 * Peaks one threshold needs before a tempo is computed: `computeBpm` requires strictly more than `minPeaks`
 */
export const requiredPeaks = minPeaks + 1;
export const thresholdStep = 0.05;
/**
 * Peaks one threshold keeps in real time, the newest ones
 * @remarks
 * Without `continuousAnalysis` nothing else ever drops a peak, and every chunk re-reads all of them:
 * loud generated 240 BPM pulses kept 2400 after 10 minutes, and a chunk then took 52 ms of its 93 ms (RBA-107).
 * 256 covers the 30 s benchmark clips whole, even at the mute window's most of 4.8 peaks a second
 * at 48 kHz, so readings that short are unchanged. It is far above `requiredPeaks`, so which threshold
 * locks is unchanged too. Past it, the reading follows the latest minute or more of audio.
 */
export const maxKeptPeaks = 256;
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

/**
 * Default stabilization window for continuous-analysis mode
 * @remarks
 * After this many milliseconds without a change in the dominant BPM,
 * the analyzer considers the tempo stable and resets the buffer.
 * Unit: milliseconds.
 */
export const defaultStabilizationTime = 20_000;

/**
 * Audio the peaks detector must have heard before it announces `bpmStable`
 * @remarks
 * Without it every first lock above the lowest rung was announced stable at once, a median 5.9 s in,
 * and 40% of those were right on the RBA-51 dev half. Replaying the recorded locks with stable and the
 * floor raise both held until 10 s gives at least 53% (the reading at 10 s is not recorded, so a track
 * that locked earlier is scored on that earlier lock), and as many tracks still get one (79%).
 * 10 s is the `computeBpmDelay` default the stable signal had until it was removed in 2023, not a value
 * tuned on that data. In `continuousAnalysis`, a `stabilizationTime` shorter than this takes its place,
 * or the reset would come before stable could.
 * Unit: seconds.
 */
export const stableWarmUpSeconds = 10;

/**
 * Default mute window applied after each detected peak
 * @remarks
 * Prevents re-detecting the same peak during its decay phase.
 * Expressed as a sample-index count, not wall-clock time.
 * Unit: audio sample indexes.
 */
export const defaultMuteTimeInIndexes = 10_000;
