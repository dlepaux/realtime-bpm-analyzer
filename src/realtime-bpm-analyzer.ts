import {getLowPassSource, findPeaksAtThreshold, computeBpm, Tempo} from './analyzer';
import {generateValidPeaksModel, generateNextIndexPeaksModel, loopOnThresholds} from './utils';

interface ScriptNodeConfiguration {
  bufferSize: number;
}

interface RealTimeBpmAnalyzerOptions {
  debug: boolean;
  scriptNode: ScriptNodeConfiguration;
  continuousAnalysis: boolean;
  stabilizedBpmCount: number;
  computeBpmDelay: number;
  stabilizationTime: number;
  pushTime: number;
  pushCallback: (bpm: Tempo[], threshold: number) => void;
  onBpmStabilized: (threshold: number) => void;
}

type Peaks = number[];
type ValidPeaks = Record<string, Peaks>;
type NextIndexPeaks = Record<string, number>;

class RealTimeBpmAnalyzer {
  options: RealTimeBpmAnalyzerOptions;
  minValidThreshold: number;
  cumulatedPushTime: number;
  timeoutPushTime: any;
  timeoutStabilization: any;
  validPeaks: ValidPeaks;
  nextIndexPeaks: NextIndexPeaks;
  chunkCoeff: number;

  /**
   * @constructor
   * @param {object} config Configuration
   * @param {boolean} config.debug Debug flag
   * @param {object} config.scriptNode Contains ScriptProcessorNode configuration
   * @param {number} config.scriptNode.bufferSize Represents both the input and output buffer size, in sample-frames. Its value can be a power of 2 value in the range 256–16384.
   * @param {boolean} config.continuousAnalysis Flag indicating if we need to analyze continuously, typically used for streams
   * @param {number} config.stabilizedBpmCount Arbitrary number of peaks found at the highest and stable threshold to define a stabilized BPM result
   * @param {number} config.computeBpmDelay Arbitrary delay to compute the BPM for the first time
   * @param {number} config.stabilizationTime Arbitrary time where we consider that a BPM is computable
   * @param {number} config.pushTime Push result of analysis (expressed in milliseconds)
   * @param {function} config.pushCallback Callback function that will returns data from analysis
   * @param {function} config.onBpmStabilized Callback function that will be triggered when the stabilizationTime is reached
   * @param {boolean} config.OfflineAudioContext OfflineAudioContext class
   */
  constructor(config = {}) {
    /**
     * Default configuration
     * @property {object} options Default configuration
     */
    this.options = {
      debug: false,
      scriptNode: {
        bufferSize: 4096,
      },
      continuousAnalysis: false,
      stabilizedBpmCount: 2000,
      computeBpmDelay: 10000,
      stabilizationTime: 20000,
      pushTime: 2000,
      pushCallback: (bpm: Tempo[]) => {
        console.log('bpm', bpm);
      },
      onBpmStabilized: threshold => {
        this.clearValidPeaks(threshold);
      },
    };

    /**
     * Overriding default configuration
     */
    Object.assign(this.options, config);

    /**
     * @property {number} minValidThreshold Minimum valid threshold, below this level result would be irrelevant.
     */
    this.minValidThreshold = 0.3;

    /**
     * @property {number} cumulatedPushTime Sum of all pushTimes
     */
    this.cumulatedPushTime = 0;

    /**
     * @property {number} timeoutPushTime Used to temporize the BPM computation
     */
    this.timeoutPushTime = null;

    /**
     * @property {number} timeoutStabilization Schedule timeout triggered when the stabilizationTime is reached
     */
    this.timeoutStabilization = null;

    /**
     * @property {object} validPeaks Contain all valid peaks
     */
    this.validPeaks = generateValidPeaksModel();

    /**
     * @property {object} nextIndexPeaks Next index (+10000 ...) to take care about peaks
     */
    this.nextIndexPeaks = generateNextIndexPeaksModel();

    /**
     * @property {number} chunkCoeff Number / Position of chunks
     */
    this.chunkCoeff = 1;
  }

  /**
   * Reset BPM computation properties to get a fresh start
   */
  reset() {
    this.minValidThreshold = 0.3;
    this.cumulatedPushTime = 0;
    this.timeoutPushTime = null;
    this.timeoutStabilization = null;
    this.validPeaks = generateValidPeaksModel();
    this.nextIndexPeaks = generateNextIndexPeaksModel();
    this.chunkCoeff = 1;
  }

  /**
   * Remve all validPeaks between the minThreshold pass in param to optimize the weight of datas
   * @param {number} minThreshold Value between 0.9 and 0.3
   */
  clearValidPeaks(minThreshold: number) {
    console.log(`[clearValidPeaks] function: under ${minThreshold}`);
    this.minValidThreshold = Number.parseFloat(minThreshold.toFixed(2));

    loopOnThresholds(threshold => {
      if (threshold < minThreshold) {
        delete this.validPeaks[threshold]; // eslint-disable-line @typescript-eslint/no-dynamic-delete
        delete this.nextIndexPeaks[threshold]; // eslint-disable-line @typescript-eslint/no-dynamic-delete
      }
    });
  }

  /**
   * Attach this function to an audioprocess event on a audio/video node to compute BPM / Tempo in realtime
   * @param {object} event Event
   */
  analyze(event: AudioProcessingEvent) {
    /**
     * Compute the maximum index with all previous chunks
     * @type {number}
     */
    const currentMaxIndex = this.options.scriptNode.bufferSize * this.chunkCoeff;

    /**
     * Compute the minimum index with all previous chunks
     * @type {number}
     */
    const currentMinIndex = currentMaxIndex - this.options.scriptNode.bufferSize;

    /**
     * Apply a low pass filter to the buffer
     * @type {AudioBufferSourceNode}
     */
    const source = getLowPassSource(event.inputBuffer);

    /**
     * Ensure to start the buffer at the begining
     */
    source.start(0);

    if (source.buffer === null) {
      return;
    }

    loopOnThresholds(threshold => {
      if (this.nextIndexPeaks[threshold] >= currentMaxIndex) {
        return;
      }

      /**
       * Get the next index in the next chunk
       */
      const offsetForNextPeak = this.nextIndexPeaks[threshold] % this.options.scriptNode.bufferSize; // 0 - 4095

      /**
       * Get peaks sort by tresold
       */
      if (source.buffer === null) {
        return;
      }

      const {peaks, threshold: atThreshold} = findPeaksAtThreshold(source.buffer.getChannelData(0), threshold, offsetForNextPeak);

      /**
       * Loop over peaks
       */
      if (peaks.length === 0) {
        return;
      }

      for (const relativeChunkPeak of peaks) {
        if (typeof relativeChunkPeak === 'undefined') {
          continue;
        }

        /**
         * Add current Index + 10K
         */
        this.nextIndexPeaks[atThreshold] = currentMinIndex + relativeChunkPeak + 10000;

        /**
         * Store valid relativeChunkPeak Indexes
         */
        this.validPeaks[atThreshold].push(currentMinIndex + relativeChunkPeak);
      }
    },
    this.minValidThreshold);

    /**
     * Increment chunk
     */
    this.chunkCoeff++;

    /**
     * Refresh BPM every 2s (default value)
     */
    if (this.timeoutPushTime !== null) {
      return;
    }

    this.timeoutPushTime = setTimeout(() => {
      this.cumulatedPushTime += this.options.pushTime;
      this.timeoutPushTime = null;

      const {bpm, threshold} = computeBpm(this.validPeaks, event.inputBuffer.sampleRate);

      this.options.pushCallback(bpm, threshold);

      // Stop all (we have enougth interval counts)
      // Never executed !
      if (bpm && bpm[0].count >= this.options.stabilizedBpmCount) {
        console.log('[freezePushBack]');
        // Freeze pushPack periodicity
        this.timeoutPushTime = 'never';
        // Cancel the audioprocess
        this.minValidThreshold = 1;
      }

      if (this.cumulatedPushTime >= this.options.computeBpmDelay && this.minValidThreshold < threshold) {
        console.log('[onBpmStabilized] function: Fired !');
        this.options.onBpmStabilized(threshold);

        /**
         * After x milliseconds, we reinit the analyzer
         */
        if (this.options.continuousAnalysis) {
          clearTimeout(this.timeoutStabilization);
          this.timeoutStabilization = setTimeout(() => {
            console.log('[timeoutStabilization] setTimeout: Fired !');
            this.options.computeBpmDelay = 0;
            this.reset();
          }, this.options.stabilizationTime);
        }
      }
    }, this.options.pushTime);
  }
}

/**
 * Expose globally RealTimeBpmAnalyzer class if possible
 */
// if (typeof window !== 'undefined') {
//   window.RealTimeBpmAnalyzer = RealTimeBpmAnalyzer;
// }

export {RealTimeBpmAnalyzer};
