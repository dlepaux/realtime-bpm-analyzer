import type {Tempo, BiquadFilterOptions} from './types';
import * as consts from './consts';
import {findPeaks} from './peak-detection';
import {identifyIntervals, groupByTempo, getTopCandidates} from './tempo';

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
export function getBiquadFilter(
  context: OfflineAudioContext | AudioContext,
  options?: BiquadFilterOptions,
): BiquadFilterNode {
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
 * @internal
 */
export async function getOfflineLowPassSource(
  buffer: AudioBuffer,
  options?: BiquadFilterOptions,
): Promise<AudioBuffer> {
  const {length, numberOfChannels, sampleRate} = buffer;
  const offlineAudioContext = new OfflineAudioContext(
    numberOfChannels,
    length,
    sampleRate,
  );

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
 * - For real-time streaming audio, use {@link createRealtimeBpmAnalyzer} instead
 * - The function returns multiple candidates sorted by confidence (count)
 * - Analysis applies a lowpass filter to isolate bass frequencies for better beat detection
 * - BPM values are normalized to the 90-180 range (doubles/halves if outside this range)
 * - Higher `count` values indicate more confidence in the detected tempo
 *
 * @see {@link createRealtimeBpmAnalyzer} for real-time streaming audio analysis
 * @see {@link getBiquadFilter} for the lowpass filter used internally
 * @see {@link Tempo} for the structure of returned tempo candidates
 * @see {@link BiquadFilterOptions} for filter configuration options
 *
 * @group Functions
 */
export async function analyzeFullBuffer(
  originalBuffer: AudioBuffer,
  options?: BiquadFilterOptions,
): Promise<Tempo[]> {
  if (!originalBuffer || originalBuffer.length === 0) {
    throw new Error('Invalid audio buffer: buffer is empty or undefined.');
  }

  if (originalBuffer.sampleRate <= 0) {
    throw new Error(
      `Invalid sample rate: ${originalBuffer.sampleRate}. Sample rate must be positive.`,
    );
  }

  const buffer = await getOfflineLowPassSource(originalBuffer, options);
  const channelData = buffer.getChannelData(0);
  const {peaks} = await findPeaks({
    audioSampleRate: buffer.sampleRate,
    channelData,
  });
  const intervals = identifyIntervals(peaks);
  const tempos = groupByTempo({
    audioSampleRate: buffer.sampleRate,
    intervalCounts: intervals,
  });
  const topCandidates = getTopCandidates(tempos);

  return topCandidates;
}
