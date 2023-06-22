import {findPeaksAtThreshold, computeBpm} from './analyzer';
import type {
  RealTimeBpmAnalyzerOptions,
  RealTimeBpmAnalyzerParameters,
  ValidPeaks,
  NextIndexPeaks,
  BpmCandidates,
  Threshold,
  PostMessageEventData,
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
 * @class RealTimeBpmAnalyzer
 **/
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
   * Stable BPM
   */
  lastTopBpmCandidate: number | undefined = undefined;
  topBpmCandidateCount = 0;
  /**
   * Computed values
   */
  computedStabilizationTimeInSeconds = 0;

  /**
   * @constructor
   */
  constructor() {
    this.updateComputedValues();
  }

  /**
   * Method to apply a configuration on the fly
   * @param {RealtimeBpmAnalyzerAsyncOptions} key Key of the configuration in this.options
   * @param {unknown} value The value you need to set
   * @returns {void}
   */
  setAsyncConfiguration(parameters: RealTimeBpmAnalyzerParameters): void {
    Object.assign(this.options, parameters);
    this.updateComputedValues();
  }

  /**
   * Update the computed values
   * @returns {void}
   */
  updateComputedValues() {
    this.computedStabilizationTimeInSeconds = this.options.stabilizationTime / 1000;
  }

  /**
   * Reset BPM computation properties to get a fresh start
   * @returns {void}
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
   * @param {Threshold} minThreshold Value between 0.9 and 0.3
   * @returns {void}
   */
  async clearValidPeaks(minThreshold: Threshold): Promise<void> {
    this.minValidThreshold = Number.parseFloat(minThreshold.toFixed(2));

    await descendingOverThresholds(async threshold => {
      if (threshold < minThreshold) {
        delete this.validPeaks[threshold]; // eslint-disable-line @typescript-eslint/no-dynamic-delete
        delete this.nextIndexPeaks[threshold]; // eslint-disable-line @typescript-eslint/no-dynamic-delete
      }

      return false;
    });
  }

  /**
   * Attach this function to an audioprocess event on a audio/video node to compute BPM / Tempo in realtime
   * @param {Float32Array} channelData Channel data
   * @param {number} audioSampleRate Audio sample rate (44100)
   * @param {number} bufferSize Buffer size (4096)
   * @param {(data: PostMessageEventData) => void} postMessage Function to post a message to the processor node
   * @returns {Promise<void>}
   */
  async analyzeChunck(channelData: Float32Array, audioSampleRate: number, bufferSize: number, postMessage: (data: PostMessageEventData) => void): Promise<void> {
    if (this.options.debug) {
      postMessage({message: 'ANALYZE_CHUNK', data: channelData});
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
    await this.findPeaks(channelData, bufferSize, currentMinIndex, currentMaxIndex, postMessage);

    /**
     * Increment chunk
     */
    this.skipIndexes++;

    const result: BpmCandidates = await computeBpm(this.validPeaks, audioSampleRate);
    const {threshold} = result;
    postMessage({message: 'BPM', result});

    /**
     * Save latest top BPM candidate
     */
    if (result.bpm.length > 0) {
      const latestBpmCandidate = result.bpm[0].tempo;

      if (this.lastTopBpmCandidate === latestBpmCandidate) {
        this.topBpmCandidateCount++;
      } else {
        this.topBpmCandidateCount = 1;
        this.lastTopBpmCandidate = latestBpmCandidate;
      }
    }

    /**
     * If the results found have a "high" threshold, the BPM is considered stable/strong
     * If the audio source is weak, the threshold won't move, so we check if the top candidate
     * is stable during the last 50 chunks (50 * 4096 = 204_800 ~ 4,6s), this value (50) is totally arbitrary
     */
    if (this.minValidThreshold < threshold || this.topBpmCandidateCount >= 50) {
      postMessage({message: 'BPM_STABLE', result});
      await this.clearValidPeaks(threshold);
    }

    /**
     * After x time, we reinit the analyzer
     */
    if (this.options.continuousAnalysis && this.effectiveBufferTime / audioSampleRate > this.computedStabilizationTimeInSeconds) {
      this.reset();
      postMessage({message: 'ANALYZER_RESETED'});
    }
  }

  /**
   * Find the best threshold with enought peaks
   * @param {Float32Array} channelData Channel data
   * @param {number} bufferSize Buffer size
   * @param {number} currentMinIndex Current minimum index
   * @param {number} currentMaxIndex Current maximum index
   * @param {(data: PostMessageEventData) => void} postMessage Function to post a message to the processor node
   * @returns {void}
   */
  async findPeaks(channelData: Float32Array, bufferSize: number, currentMinIndex: number, currentMaxIndex: number, postMessage: (data: PostMessageEventData) => void): Promise<void> {
    await descendingOverThresholds(async threshold => {
      if (this.nextIndexPeaks[threshold] >= currentMaxIndex) {
        return false;
      }

      /**
       * Get the next index in the next chunk
       */
      const offsetForNextPeak = this.nextIndexPeaks[threshold] % bufferSize; // 0 - 4095

      const {peaks, threshold: atThreshold} = findPeaksAtThreshold(channelData, threshold, offsetForNextPeak);

      /**
       * Loop over peaks
       */
      if (peaks.length === 0) {
        return false;
      }

      for (const relativeChunkPeak of peaks) {
        const index = currentMinIndex + relativeChunkPeak;

        /**
         * Add current Index + muteTimeInIndexes (10000/44100=0.22s)
         */
        this.nextIndexPeaks[atThreshold] = index + this.options.muteTimeInIndexes;

        /**
         * Store valid relativeChunkPeak Indexes
         */
        this.validPeaks[atThreshold].push(index);

        if (this.options.debug) {
          postMessage({
            message: 'VALID_PEAK',
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
