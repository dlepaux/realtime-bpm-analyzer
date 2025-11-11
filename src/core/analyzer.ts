import {descendingOverThresholds} from './utils';
import type {
  Peaks,
  PeaksAndThreshold,
  BpmCandidates,
  Interval,
  Tempo,
  Threshold,
  AnalyzerFindPeaksOptions,
  AnalyzerGroupByTempoOptions,
  AnalyzerComputeBpmOptions,
  BiquadFilterOptions,
  AnalyzerFindPeaksAtTheshold,
} from './types';
import * as consts from './consts';
import * as utils from './utils';

/**
 * Find peaks when the signal if greater than the threshold, then move 10_000 indexes (represents ~0.23s) to ignore the descending phase of the parabol
 * @param options - AnalyzerFindPeaksAtTheshold
 * @param options.audioSampleRate - Sample rate
 * @param options.data - Buffer channel data
 * @param options.threshold - Threshold for qualifying as a peak
 * @param options.offset - Position where we start to loop
 * @returns Peaks found that are greater than the threshold
 */
export function findPeaksAtThreshold({
  audioSampleRate,
  data,
  threshold,
  offset = 0,
}: AnalyzerFindPeaksAtTheshold): PeaksAndThreshold {
  if (threshold < 0 || threshold > 1) {
    throw new Error('Invalid threshold: ' + threshold + '. Threshold must be between 0 and 1.');
  }

  if (audioSampleRate <= 0) {
    throw new Error('Invalid sample rate: ' + audioSampleRate + '. Sample rate must be positive.');
  }

  const peaks: Peaks = [];
  const skipForwardIndexes = utils.computeIndexesToSkip(consts.peakSkipDuration, audioSampleRate);

  const {length} = data;

  /**
   * Identify peaks that are greater than the threshold, adding them to the collection
   */
  for (let i = offset; i < length; i += 1) {
    if (data[i] > threshold) {
      peaks.push(i);

      /**
       * Skip forward ~0.25s to pass this peak
       */
      i += skipForwardIndexes;
    }
  }

  return {
    peaks,
    threshold,
  };
}

/**
 * Find the minimum amount of peaks from top to bottom threshold, it's necessary to analyze at least 10seconds at 90bpm
 * @param options - AnalyzerFindPeaksOptions
 * @param options.audioSampleRate - Sample rate
 * @param options.channelData - Channel data
 * @returns Suffisent amount of peaks in order to continue further the process
 */
export async function findPeaks({
  audioSampleRate,
  channelData,
}: AnalyzerFindPeaksOptions): Promise<PeaksAndThreshold> {
  if (audioSampleRate <= 0) {
    throw new Error(`Invalid sample rate: ${audioSampleRate}. Sample rate must be positive.`);
  }

  if (!channelData || channelData.length === 0) {
    throw new Error('Invalid channel data: buffer is empty or undefined.');
  }

  let validPeaks: Peaks = [];
  let validThreshold = 0;

  await descendingOverThresholds(async threshold => {
    const {peaks} = findPeaksAtThreshold({audioSampleRate, data: channelData, threshold});

    /**
     * Loop over peaks
     */
    if (peaks.length < consts.minPeaks) {
      return false;
    }

    validPeaks = peaks;
    validThreshold = threshold;

    return true;
  });

  return {
    peaks: validPeaks,
    threshold: validThreshold,
  };
}

/**
 * Creates a biquad lowpass filter for audio processing.
 *
 * This filter helps isolate low-frequency components (bass) from the audio signal,
 * which is useful for detecting rhythmic patterns and beats in BPM analysis.
 *
 * @param context - The AudioContext or OfflineAudioContext to create the filter in
 * @param options - Optional configuration for the filter's frequency and quality
 * @returns A configured BiquadFilterNode ready to use in an audio graph
 *
 * @example
 * ```typescript
 * const audioContext = new AudioContext();
 * const filter = getBiquadFilter(audioContext, {
 *   frequencyValue: 150,  // Hz - frequencies above this are attenuated
 *   qualityValue: 1       // Q factor - steepness of the filter
 * });
 *
 * // Use in an audio graph
 * source.connect(filter);
 * filter.connect(audioContext.destination);
 * ```
 *
 * @remarks
 * - Default frequency is optimized for detecting bass drum kicks
 * - The lowpass filter attenuates high frequencies while preserving low frequencies
 * - Higher Q values create a steeper filter curve
 *
 * @see {@link analyzeFullBuffer} which uses this filter internally
 * @see {@link BiquadFilterOptions} for configuration options
 *
 * @group Functions
 */
export function getBiquadFilter(context: OfflineAudioContext | AudioContext, options?: BiquadFilterOptions): BiquadFilterNode {
  const lowpass = context.createBiquadFilter();

  lowpass.type = 'lowpass';
  lowpass.frequency.value = options?.frequencyValue ?? consts.frequencyValue;
  lowpass.Q.value = options?.qualityValue ?? consts.qualityValue;

  return lowpass;
}

/**
 * Apply to the source a biquad lowpass filter
 * @param buffer - Audio buffer
 * @param options - Optionnal BiquadFilterOptions
 * @returns A Promise that resolves an AudioBuffer instance
 */
export async function getOfflineLowPassSource(buffer: AudioBuffer, options?: BiquadFilterOptions): Promise<AudioBuffer> {
  const {length, numberOfChannels, sampleRate} = buffer;
  const offlineAudioContext = new OfflineAudioContext(numberOfChannels, length, sampleRate);

  /**
   * Create buffer source
   */
  const source = offlineAudioContext.createBufferSource();
  source.buffer = buffer;

  const lowpass = getBiquadFilter(offlineAudioContext, options);

  /**
   * Pipe the song into the filter, and the filter into the offline context
   */
  source.connect(lowpass);
  lowpass.connect(offlineAudioContext.destination);

  source.start(0);

  const audioBuffer = await offlineAudioContext.startRendering();

  return audioBuffer;
}

/**
 * Return the computed bpm from data
 * @param options - AnalyzerComputeBpmOptions
 * @param options.data - Contain valid peaks
 * @param options.audioSampleRate - Audio sample rate
 * @returns A Promise that resolves BPM Candidates
 */
export async function computeBpm({
  audioSampleRate,
  data,
}: AnalyzerComputeBpmOptions): Promise<BpmCandidates> {
  const minPeaks = consts.minPeaks;

  /**
   * Flag to fix Object.keys looping
   */
  let hasPeaks = false;
  let foundThreshold = consts.minValidThreshold;

  await descendingOverThresholds(async (threshold: Threshold) => {
    if (hasPeaks) {
      return true;
    }

    const thresholdKey = threshold.toFixed(2);

    if (data[thresholdKey] && data[thresholdKey].length > minPeaks) {
      hasPeaks = true;
      foundThreshold = threshold;
    }

    return false;
  });

  if (hasPeaks && foundThreshold) {
    const foundThresholdKey = foundThreshold.toFixed(2);
    const intervals = identifyIntervals(data[foundThresholdKey]);
    const tempos = groupByTempo({audioSampleRate, intervalCounts: intervals});
    const candidates = getTopCandidates(tempos);

    const bpmCandidates: BpmCandidates = {
      bpm: candidates,
      threshold: foundThreshold,
    };

    return bpmCandidates;
  }

  return {
    bpm: [],
    threshold: foundThreshold,
  };
}

/**
 * Sort results by count and return top candidate
 * @param candidates - BPMs with count
 * @param length - Amount of returned candidates (default: 5)
 * @returns Returns the 5 top candidates with highest counts
 */
export function getTopCandidates(candidates: Tempo[], length = 5): Tempo[] {
  return candidates.sort((a, b) => (b.count - a.count)).slice(0, length);
}

/**
 * Gets the top candidate from the array
 * @param candidates - BPMs with counts.
 * @returns Returns the top candidate with the highest count.
 * @throws {Error} When the candidates array is empty (insufficient samples for reliable detection)
 */
export function getTopCandidate(candidates: Tempo[]): number {
  if (candidates.length === 0) {
    throw new Error('Could not find enough samples for a reliable detection.');
  }

  const [first] = candidates.sort((a, b) => (b.count - a.count));

  return first.tempo;
}

/**
 * Identify intervals between bass peaks
 * @param peaks - Array of qualified bass peaks
 * @returns Return a collection of intervals between peaks
 */
export function identifyIntervals(peaks: Peaks): Interval[] {
  const intervals: Interval[] = [];

  for (let n = 0; n < peaks.length; n++) {
    for (let i = 0; i < consts.maxIntervalComparisons; i++) {
      const peak = peaks[n];
      const peakIndex = n + i;
      const interval = peaks[peakIndex] - peak;

      /**
       * Try and find a matching interval and increase it's count
       */
      const foundInterval = intervals.some((intervalCount: Interval) => {
        if (intervalCount.interval === interval) {
          intervalCount.count += 1;
          return intervalCount.count;
        }

        return false;
      });

      /**
       * Add the interval to the collection if it's unique
       */
      if (!foundInterval) {
        const item: Interval = {
          interval,
          count: 1,
        };
        intervals.push(item);
      }
    }
  }

  return intervals;
}

/**
 * Figure out best possible tempo candidates
 * @param options - AnalyzerGroupByTempoOptions
 * @param options.audioSampleRate - Audio sample rate
 * @param options.intervalCounts - List of identified intervals
 * @returns Intervals grouped with similar values
 */
export function groupByTempo({
  audioSampleRate,
  intervalCounts,
}: AnalyzerGroupByTempoOptions): Tempo[] {
  const tempoCounts: Tempo[] = [];

  for (const intervalCount of intervalCounts) {
    /**
     * Skip if interval is equal 0
     */
    if (intervalCount.interval === 0) {
      continue;
    }

    // Use local variable to avoid mutating input parameter
    const absoluteInterval = Math.abs(intervalCount.interval);

    /**
     * Convert an interval to tempo
     */
    let theoreticalTempo = (60 / (absoluteInterval / audioSampleRate));

    /**
     * Adjust the tempo to fit within the 90-180 BPM range
     */
    while (theoreticalTempo < consts.minBpmRange) {
      theoreticalTempo *= 2;
    }

    while (theoreticalTempo > consts.maxBpmRange) {
      theoreticalTempo /= 2;
    }

    /**
     * Round to legible integer
     */
    theoreticalTempo = Math.round(theoreticalTempo);

    /**
     * See if another interval resolved to the same tempo
     */
    const foundTempo: boolean = tempoCounts.some((tempoCount: Tempo) => {
      if (tempoCount.tempo === theoreticalTempo) {
        tempoCount.count += intervalCount.count;
        return tempoCount.count;
      }

      return false;
    });

    /**
     * Add a unique tempo to the collection
     */
    if (!foundTempo) {
      const tempo: Tempo = {
        tempo: theoreticalTempo,
        count: intervalCount.count,
        confidence: 0,
      };

      tempoCounts.push(tempo);
    }
  }

  return tempoCounts;
}

/**
 * Analyzes a complete audio buffer to detect the BPM (tempo) synchronously.
 *
 * This function performs offline analysis of an entire audio file to detect
 * its tempo. It's ideal for analyzing pre-recorded audio files where you
 * have the complete audio data available.
 *
 * @param originalBuffer - The AudioBuffer containing the complete audio to analyze
 * @param options - Optional filter configuration to customize bass detection
 * @returns A promise that resolves to an array of tempo candidates sorted by confidence
 *
 * @example
 * **Analyze an uploaded audio file**
 * ```typescript
 * const audioContext = new AudioContext();
 *
 * // Load audio file
 * const response = await fetch('song.mp3');
 * const arrayBuffer = await response.arrayBuffer();
 * const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
 *
 * // Analyze BPM
 * const tempos = await analyzeFullBuffer(audioBuffer);
 *
 * console.log('Detected BPM:', tempos[0].tempo);
 * console.log('Confidence:', tempos[0].count);
 * console.log('Top 5 candidates:', tempos);
 * ```
 *
 * @example
 * **With custom filter settings**
 * ```typescript
 * const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
 *
 * const tempos = await analyzeFullBuffer(audioBuffer, {
 *   frequencyValue: 150,  // Focus on bass frequencies
 *   qualityValue: 1       // Filter steepness
 * });
 *
 * // Get the most likely BPM
 * const mostLikelyBPM = tempos[0].tempo;
 * ```
 *
 * @example
 * **Analyze from file input**
 * ```typescript
 * const fileInput = document.querySelector('input[type="file"]');
 *
 * fileInput.addEventListener('change', async (e) => {
 *   const file = e.target.files[0];
 *   const arrayBuffer = await file.arrayBuffer();
 *   const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
 *
 *   const tempos = await analyzeFullBuffer(audioBuffer);
 *
 *   if (tempos.length > 0) {
 *     console.log(`Detected BPM: ${tempos[0].tempo} with ${tempos[0].count} matching intervals`);
 *   }
 * });
 * ```
 *
 * @remarks
 * - This is a synchronous/offline analysis method (analyzes complete audio at once)
 * - For real-time streaming audio, use {@link createRealTimeBpmProcessor} instead
 * - The function returns multiple candidates sorted by confidence (count)
 * - Analysis applies a lowpass filter to isolate bass frequencies for better beat detection
 * - BPM values are normalized to the 90-180 range (doubles/halves if outside this range)
 * - Higher `count` values indicate more confidence in the detected tempo
 *
 * @see {@link createRealTimeBpmProcessor} for real-time streaming audio analysis
 * @see {@link getBiquadFilter} for the lowpass filter used internally
 * @see {@link Tempo} for the structure of returned tempo candidates
 * @see {@link BiquadFilterOptions} for filter configuration options
 *
 * @group Functions
 */
export async function analyzeFullBuffer(originalBuffer: AudioBuffer, options?: BiquadFilterOptions): Promise<Tempo[]> {
  if (!originalBuffer || originalBuffer.length === 0) {
    throw new Error('Invalid audio buffer: buffer is empty or undefined.');
  }

  if (originalBuffer.sampleRate <= 0) {
    throw new Error(`Invalid sample rate: ${originalBuffer.sampleRate}. Sample rate must be positive.`);
  }

  const buffer = await getOfflineLowPassSource(originalBuffer, options);
  const channelData = buffer.getChannelData(0);
  const {peaks} = await findPeaks({audioSampleRate: buffer.sampleRate, channelData});
  const intervals = identifyIntervals(peaks);
  const tempos = groupByTempo({audioSampleRate: buffer.sampleRate, intervalCounts: intervals});
  const topCandidates = getTopCandidates(tempos);

  return topCandidates;
}
