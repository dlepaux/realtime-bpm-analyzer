import {Analyzer} from './analyzer.js';
import utils from './utils.js';

const analyzer = new Analyzer();

/**
 * RealTimeBPMAnalyzer Class
 */
class RealTimeBPMAnalyzer {
  /**
   * @constructor
   * @param {object} config Configuration
   * @param {boolean} config.debug Debug flag
   * @param {object} config.scriptNode Contains ScriptProcessorNode configuration
   * @param {number} config.scriptNode.bufferSize Represents both the input and output buffer size, in sample-frames. Its value can be a power of 2 value in the range 256–16384.
   * @param {boolean} config.continuousAnalysis Flag indicating if we need to analyze continuously, typically used for streams
   * @param {boolean} config.stabilizedBpmCount Arbitrary number of peaks found at the highest and stable thresold to define a stabilized BPM result
   * @param {boolean} config.computeBPMDelay
   * @param {number} config.stabilizationTime Arbitrary time where we consider that a BPM is computable
   * @param {number} config.pushTime Push result of analysis (expressed in milliseconds)
   * @param {function} config.pushCallback Callback function that will returns data from analysis
   * @param {function} config.onBpmStabilized Callback function that will be triggered when the stabilizationTime is reached
   * @param {boolean} config.webAudioAPI
   */
  constructor(config = {}) {
    /**
     * Default configuration
     * @type {object}
     */
    this.options = {
      debug: false,
      scriptNode: {
        bufferSize: 4096,
      },
      continuousAnalysis: false,
      stabilizedBpmCount: 2000,
      computeBPMDelay: 10000,
      stabilizationTime: 20000,
      pushTime: 2000,
      pushCallback: (error, _bpm) => {
        if (error) {
          throw new Error(error);
        }
      },
      onBpmStabilized: thresold => {
        this.clearValidPeaks(thresold);
      },
      webAudioAPI: {
        OfflineAudioContext: typeof window === 'object' && (window.OfflineAudioContext || window.webkitOfflineAudioContext),
      },
    };

    /**
     * Logger
     * @param {string} args Data to log
     */
    this.logger = (...args) => {
      if (this.options.debug) {
        console.log(...args);
      }
    };

    /**
     * Overriding default configuration
     */
    Object.assign(this.options, config);

    /**
     * Initialize variables and thresolds object's
     */
    this.initClass();
  }

  /**
   * Instentiate some vars, counter, ..
   */
  initClass() {
    /**
     * Used to temporize the BPM computation
     */
    this.minValidThresold = 0.3;

    /**
     * Used to temporize the BPM computation
     */
    this.cumulatedPushTime = 0;

    /**
     * Used to temporize the BPM computation
     */
    this.waitPushTime = null;
    this.waitStabilization = null;

    /**
     * Contain all valid peaks
     */
    this.validPeaks = utils.generateObjectModel([]);

    /**
     * Next index (+10000 ...) to take care about peaks
     */
    this.nextIndexPeaks = utils.generateObjectModel(0);

    /**
     * Number / Position of chunks
     */
    this.chunkCoeff = 1;
  }

  /**
   * Remve all validPeaks between the minThresold pass in param to optimize the weight of datas
   * @param  {Float} minThresold Value between 1 and 0
   */
  clearValidPeaks(minThresold) {
    this.logger(`[clearValidPeaks] function: under ${minThresold}`);
    this.minValidThresold = minThresold.toFixed(2);

    utils.loopOnThresolds((object, thresold) => {
      if (thresold < minThresold) {
        delete this.validPeaks[thresold];
        delete this.nextIndexPeaks[thresold];
      }
    });
  }

  /**
   * Attach this function to an audioprocess event on a audio/video node to compute BPM / Tempo in realtime
   * @param {object} event Event
   */
  analyze(event) {
    /**
     * Compute the maximum index with all previous chunks
     * @type {integer}
     */
    const currentMaxIndex = this.options.scriptNode.bufferSize * this.chunkCoeff;

    /**
     * Compute the minimum index with all previous chunks
     * @type {integer}
     */
    const currentMinIndex = currentMaxIndex - this.options.scriptNode.bufferSize;

    /**
     * Apply a low pass filter to the buffer
     * @type {integer}
     */
    const source = analyzer.getLowPassSource(event.inputBuffer, this.options.webAudioAPI.OfflineAudioContext);
    source.start(0);

    utils.loopOnThresolds((object, thresold) => {
      if (this.nextIndexPeaks[thresold] < currentMaxIndex) {
        // Get the next index in the next chunk
        const offsetForNextPeak = this.nextIndexPeaks[thresold] % this.options.scriptNode.bufferSize; // 0 - 4095
        // Get peaks sort by tresold
        analyzer.findPeaksAtThresold(source.buffer.getChannelData(0), thresold, offsetForNextPeak, (peaks, atThresold) => {
          // Loop over peaks
          if (typeof peaks !== 'undefined') {
            for (const key of Object.keys(peaks)) {
              // If we got some data..
              const relativeChunkPeak = peaks[key];

              if (typeof (relativeChunkPeak) !== 'undefined') {
                // Add current Index + 10K
                this.nextIndexPeaks[atThresold] = currentMinIndex + relativeChunkPeak + 10000;
                // Store valid relativeChunkPeak
                this.validPeaks[atThresold].push(currentMinIndex + relativeChunkPeak);
              }
            }
          }
        });
      }
    }, this.minValidThresold, () => {
      // Refresh BPM every 2s (default value)
      if (this.waitPushTime === null) {
        this.waitPushTime = setTimeout(() => {
          this.cumulatedPushTime += this.options.pushTime;
          this.waitPushTime = null;
          analyzer.computeBPM(this.validPeaks, event.inputBuffer.sampleRate, (error, bpm, thresold) => {
            this.options.pushCallback(error, bpm, thresold);

            // Stop all (we have enougth interval counts)
            // Never executed !
            if (!error && bpm && bpm[0].count >= this.options.stabilizedBpmCount) {
              this.logger('[freezePushBack]');
              // Freeze pushPack periodicity
              this.waitPushTime = 'never';
              // Cancel the audioprocess
              this.minValidThresold = 1;
            }

            if (this.cumulatedPushTime >= this.options.computeBPMDelay
             && this.minValidThresold < thresold
            ) {
              this.logger('[onBpmStabilized] function: Fired !');
              this.options.onBpmStabilized(thresold);

              // After x milliseconds, we reinit the analyzer
              if (this.options.continuousAnalysis) {
                clearTimeout(this.waitStabilization);
                this.waitStabilization = setTimeout(() => {
                  this.logger('[waitStabilization] setTimeout: Fired !');
                  this.options.computeBPMDelay = 0;
                  this.initClass();
                }, this.options.stabilizationTime);
              }
            }
          });
        }, this.options.pushTime);
      }

      // Increment chunk
      this.chunkCoeff++;
    });
  }
}

export {RealTimeBPMAnalyzer};
