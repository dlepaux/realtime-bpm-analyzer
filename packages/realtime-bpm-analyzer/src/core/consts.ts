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
 * loud generated 240 BPM pulses kept 2400 after 10 minutes, and a chunk then took 52 ms of its 93 ms.
 * 256 covers the 30 s benchmark clips whole, even at the mute window's most of 4.8 peaks a second
 * at 48 kHz, so readings that short are unchanged. It is far above `requiredPeaks`, so which threshold
 * locks is unchanged too. Past it, the reading follows the latest minute or more of audio.
 */
export const maxKeptPeaks = 256;
/**
 * The percentile of a channel's per-window maxima that the peaks file path takes as the level of its loudest beats,
 * when its fixed ladder finds no tempo
 * @remarks
 * A window is {@link peakSkipDuration} long, the span one peak occupies. The maximum sorted at index
 * `Math.floor((n - 1) * 98 / 100)` of the `n` windows is the level: whole-number arithmetic, so every port picks the
 * same window. At 98 the loudest window never sets the level on a file of two windows or more, and on a 3-minute
 * file the loudest 15 don't, so one click or clipped transient can't. On the generated test sources every quiet or
 * high-passed variant reads its tempo with any percentile from 97 to 100, while 95 and under read a high-passed full
 * mix at 114 instead of 96, because the ladder then starts under its beats.
 */
export const levelPercentile = 98;
/**
 * The level, as a sample value, under which the peaks file path's level-relative search reads a channel as silence:
 * -70 dBFS, `10 ** (-70 / 20)`, written out so every port compares with the same double
 * @remarks
 * Under it the scaled ladder would count dither and noise as beats. It is 13 dB under the quietest generated variant
 * with a clear beat (a click at -24 dB through a 300 Hz highpass, -56.7 dBFS after the lowpass), and well above
 * a 16-bit file's quantisation noise after the lowpass.
 */
export const silenceFloor = 0.00031622776601683794;
/** The lowpass defaults, which `LowpassOption` documents */
export const lowpassFrequency = 200;
export const lowpassQ = 1;

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
 * The largest `tempoRange.max`, in BPM: 2^31 - 1, so that a reading's whole BPM fits a signed 32-bit integer, the
 * `int` the JVM port and other typed ports return it in. No music comes near it.
 */
export const maxTempoRangeBpm = (2 ** 31) - 1;

/**
 * Duration in seconds to skip after detecting a peak
 * @remarks
 * This prevents detecting the same peak multiple times during its decay phase.
 * 0.25 seconds is approximately the minimum time between distinct beats at high tempos.
 */
export const peakSkipDuration = 0.25;

/**
 * The lowest sample rate, in Hz, the peaks engine runs at: the lowest at which {@link peakSkipDuration} rounds to at
 * least one sample (`Math.round(0.25 * 2)` is 1). Under it the skip after a peak is no sample, and 6.1.0's peak
 * search found the same peak forever.
 */
export const peaksMinSampleRate = 2;

/**
 * The lowest sample rate, in Hz, the tempogram runs at: the first at which its FFT has a bin above DC.
 * @remarks
 * The onset stage's FFT has `2 ** Math.round(Math.log2(0.023 * rate))` points, the power of two nearest 23 ms. At 2
 * points its bins are DC and Nyquist, which the onset sums skip, so every onset strength is 0 and 6.1 and 6.2 read null
 * from 100 Hz up to here, whatever the audio. 4 points need `log2(0.023 * rate) >= 1.5`, since Math.round takes a half
 * up: a rate of at least 2^1.5 / 0.023 = 122.975092380269... Hz, which is no whole number. The floor is the double
 * `2 * Math.SQRT2 / 0.023`, written out so that every port parses the same double and compares `rate >= floor`:
 * - At the floor, `0.023 * rate` is 2.8284271247461903, the double nearest 2√2, which lies above 2√2. Its log2 is above
 *   1.5 by less than half a step, so a log2 within a step of the truth, Math.log2 and a ratio of logarithms included,
 *   gives at least 1.5: 4 points. A higher rate gives no smaller product.
 * - The double under it, 122.97509238026913, gives 2.82842712474619, under 2√2, where Math.log2 gives
 *   1.4999999999999998: 2 points. A ratio of logarithms gives 1.5 there, as on the double under that, which is why the
 *   floor is this comparison and not the FFT size each port computes.
 *
 * From the floor up, bin 1, at 31 to 62 Hz, falls in the first band (30 to 200 Hz), and the hop,
 * `Math.round(rate / 100)`, is at least one sample, which was the reason for the 100 Hz floor before.
 */
export const tempogramMinSampleRate = 122.97509238026915;

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
 * Audio the peaks detector must have heard before it offers a lock
 * @remarks
 * Without it every first lock above the lowest rung was announced stable at once, a median 5.9 s in,
 * and 40% of those were right on the benchmark's dev half. Replaying the recorded locks with stable and the
 * floor raise both held until 10 s gives at least 53% (the reading at 10 s is not recorded, so a track
 * that locked earlier is scored on that earlier lock), and as many tracks still get one (79%).
 * 10 s is the `computeBpmDelay` default the stable signal had until it was removed in 2023, not a value
 * tuned on that data. An `engine.restartAfterSeconds` shorter than this takes its place, or the restart
 * would come before a lock could.
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
