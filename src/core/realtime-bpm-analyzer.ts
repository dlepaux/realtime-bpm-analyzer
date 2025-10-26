import {findPeaksAtThreshold, computeBpm} from './analyzer';
import type {
  RealTimeBpmAnalyzerOptions,
  RealTimeBpmAnalyzerParameters,
  ValidPeaks,
  NextIndexPeaks,
  BpmCandidates,
  Threshold,
  RealtimeFindPeaksOptions,
  RealtimeAnalyzeChunkOptions,
} from './types';
import {
  generateValidPeaksModel,
  generateNextIndexPeaksModel,
  descendingOverThresholds,
} from './utils';
import * as consts from './consts';

/**
 * Initial value of key parameters of the analyzer
 */
const initialValue = {
  minValidThreshold: () => consts.minValidThreshold,
  validPeaks: () => generateValidPeaksModel(),
  nextIndexPeaks: () => generateNextIndexPeaksModel(),
  skipIndexes: () => 1,
  effectiveBufferTime: () => 0,
};

/**
 * Core analyzer class for real-time BPM detection.
 *
 * This class manages the state and logic for analyzing audio chunks in real-time
 * to detect beats per minute. It's used internally by the AudioWorklet processor.
 *
 * @remarks
 * Most users should use {@link createRealTimeBpmProcessor} instead of instantiating
 * this class directly. This class is primarily for internal use or advanced scenarios.
 *
 * @group Classes
 */
export class RealTimeBpmAnalyzer {
  /**
   * Default configuration
   */
  options: RealTimeBpmAnalyzerOptions = {
    continuousAnalysis: false,
    stabilizationTime: 20000,
    muteTimeInIndexes: 10000,
    debug: false,
  };

  /**
   * Minimum valid threshold, below this level result would be irrelevant.
   */
  minValidThreshold: Threshold = initialValue.minValidThreshold();
  /**
   * Contain all valid peaks
   */
  validPeaks: ValidPeaks = initialValue.validPeaks();
  /**
   * Next index (+10000 ...) to take care about peaks
   */
  nextIndexPeaks: NextIndexPeaks = initialValue.nextIndexPeaks();
  /**
   * Number / Position of chunks
   */
  skipIndexes: number = initialValue.skipIndexes();
  effectiveBufferTime: number = initialValue.effectiveBufferTime();
  /**
   * Computed values
   */
  computedStabilizationTimeInSeconds = 0;

  constructor(options: RealTimeBpmAnalyzerParameters = {}) {
    Object.assign(this.options, options);
    this.updateComputedValues();
  }

  /**
   * Update the computed values
   */
  updateComputedValues() {
    this.computedStabilizationTimeInSeconds = this.options.stabilizationTime / 1000;
  }

  /**
   * Reset BPM computation properties to get a fresh start
   */
  reset(): void {
    this.minValidThreshold = initialValue.minValidThreshold();
    this.validPeaks = initialValue.validPeaks();
    this.nextIndexPeaks = initialValue.nextIndexPeaks();
    this.skipIndexes = initialValue.skipIndexes();
    this.effectiveBufferTime = initialValue.effectiveBufferTime();
  }

  /**
   * Remve all validPeaks between the minThreshold pass in param to optimize the weight of datas
   * @param minThreshold - Value between 0.9 and 0.2
   */
  async clearValidPeaks(minThreshold: Threshold): Promise<void> {
    this.minValidThreshold = Number.parseFloat(minThreshold.toFixed(2));

    await descendingOverThresholds(async threshold => {
      const thresholdKey = threshold.toFixed(2);

      if (threshold < minThreshold && this.validPeaks[thresholdKey] !== undefined) {
        delete this.validPeaks[thresholdKey]; // eslint-disable-line @typescript-eslint/no-dynamic-delete
        delete this.nextIndexPeaks[thresholdKey]; // eslint-disable-line @typescript-eslint/no-dynamic-delete
      }

      return false;
    });
  }

  /**
   * Attach this function to an audioprocess event on a audio/video node to compute BPM / Tempo in realtime
   * @param options - RealtimeAnalyzeChunkOptions
   * @param options.audioSampleRate - Audio sample rate (44100)
   * @param options.channelData - Channel data
   * @param options.bufferSize - Buffer size (4096)
   * @param options.postMessage - Function to post a message to the processor node
   */
  async analyzeChunk({audioSampleRate, channelData, bufferSize, postMessage}: RealtimeAnalyzeChunkOptions): Promise<void> {
    if (this.options.debug) {
      postMessage({type: 'analyzeChunk', data: channelData});
    }

    /**
     * We are summing up the size of each analyzed chunks in order to compute later if we reached the stabilizationTime
     * Ex: effectiveBufferTime / audioSampleRate = timeInSeconds (1000000/44100=22s)
     */
    this.effectiveBufferTime += bufferSize;

    /**
     * Compute the maximum index with all previous chunks
     */
    const currentMaxIndex = bufferSize * this.skipIndexes;

    /**
     * Compute the minimum index with all previous chunks
     */
    const currentMinIndex = currentMaxIndex - bufferSize;

    /**
     * Mutate nextIndexPeaks and validPeaks if possible
     */
    await this.findPeaks({
      audioSampleRate,
      channelData,
      bufferSize,
      currentMinIndex,
      currentMaxIndex,
      postMessage,
    });

    /**
     * Increment chunk
     */
    this.skipIndexes++;

    const data: BpmCandidates = await computeBpm({audioSampleRate, data: this.validPeaks});
    const {threshold} = data;
    postMessage({type: 'bpm', data});

    /**
     * If the results found have a "high" threshold, the BPM is considered stable/strong
     */
    if (this.minValidThreshold < threshold) {
      postMessage({type: 'bpmStable', data});
      await this.clearValidPeaks(threshold);
    }

    /**
     * After x time, we reinit the analyzer
     */
    if (this.options.continuousAnalysis && this.effectiveBufferTime / audioSampleRate > this.computedStabilizationTimeInSeconds) {
      this.reset();
      postMessage({type: 'analyzerReset'});
    }
  }

  /**
   * Find the best threshold with enought peaks
   * @param options - Options for finding peaks
   * @param options.audioSampleRate - Sample rate
   * @param options.channelData - Channel data
   * @param options.bufferSize - Buffer size
   * @param options.currentMinIndex - Current minimum index
   * @param options.currentMaxIndex - Current maximum index
   * @param options.postMessage - Function to post a message to the processor node
   */
  async findPeaks({
    audioSampleRate,
    channelData,
    bufferSize,
    currentMinIndex,
    currentMaxIndex,
    postMessage,
  }: RealtimeFindPeaksOptions): Promise<void> {
    await descendingOverThresholds(async threshold => {
      const thresholdKey = threshold.toFixed(2);

      if (this.nextIndexPeaks[thresholdKey] >= currentMaxIndex) {
        return false;
      }

      /**
       * Get the next index in the next chunk
       */
      const offsetForNextPeak = this.nextIndexPeaks[thresholdKey] % bufferSize; // 0 - 4095

      const {peaks, threshold: atThreshold} = findPeaksAtThreshold({audioSampleRate, data: channelData, threshold, offset: offsetForNextPeak});

      /**
       * Loop over peaks
       */
      if (peaks.length === 0) {
        return false;
      }

      const atThresholdKey = atThreshold.toFixed(2);

      for (const relativeChunkPeak of peaks) {
        const index = currentMinIndex + relativeChunkPeak;

        /**
         * Add current Index + muteTimeInIndexes (10000/44100=0.22s)
         */
        this.nextIndexPeaks[atThresholdKey] = index + this.options.muteTimeInIndexes;

        /**
         * Store valid relativeChunkPeak Indexes
         */
        this.validPeaks[atThresholdKey].push(index);

        if (this.options.debug) {
          postMessage({
            type: 'validPeak',
            data: {
              threshold: atThreshold,
              index,
            },
          });
        }
      }

      return false;
    }, this.minValidThreshold);
  }
}
