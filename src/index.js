'use strict';

const analyzer = require('./analyzer');
const utils = require('./utils');

/**
 * RealTimeBPMAnalyzer Class
 */
class RealTimeBPMAnalyzer {
  /**
   * Define default configuration
   * @param  {Object} config Configuration
   */

  constructor(config = {}) {
    /**
     * Default configuration
     * @type {Object}
     */

    this.options = {
      debug: false,
      element: null,
      scriptNode: {
        bufferSize: 4096,
        numberOfInputChannels: 1,
        numberOfOutputChannels: 1
      },
      continuousAnalysis: false,
      stabilizedBpmCount: 2000,
      computeBPMDelay: 10000,
      stabilizationTime: 20000,
      pushTime: 2000,
      pushCallback: (err, _bpm) => {
        if (err) {
          throw new Error(err);
        }
      },
      onBpmStabilized: thresold => {
        this.clearValidPeaks(thresold);
      },
      webAudioAPI: {
        OfflineAudioContext: typeof window === 'object' && (window.OfflineAudioContext || window.webkitOfflineAudioContext)
      }
    };

    /**
     * Logger
     * @param  {String} log Data to log
     */
    this.logger = log => {
      if (this.options.debug) {
        console.log(log);
      }
    },

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
   * @return {[type]} [description]
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
        const offsetForNextPeak = this.nextIndexPeaks[thresold] % 4096; // 0 - 4095
        // Get peaks sort by tresold
        analyzer.findPeaksAtThresold(source.buffer.getChannelData(0), thresold, offsetForNextPeak, (peaks, atThresold) => {
          // Loop over peaks
          if (typeof peaks !== 'undefined') {
            Object.keys(peaks).forEach(key => {
              // If we got some data..
              const relativeChunkPeak = peaks[key];

              if (typeof (relativeChunkPeak) !== 'undefined') {
                // Add current Index + 10K
                this.nextIndexPeaks[atThresold] = currentMinIndex + relativeChunkPeak + 10000;
                // Store valid relativeChunkPeak
                this.validPeaks[atThresold].push(currentMinIndex + relativeChunkPeak);
              }
            });
          }
        });
      }
    }, this.minValidThresold, () => {
      // Refresh BPM every 2s (default value)
      if (this.waitPushTime === null) {
        this.waitPushTime = setTimeout(() => {
          this.cumulatedPushTime += this.options.pushTime;
          this.waitPushTime = null;
          analyzer.computeBPM(this.validPeaks, event.inputBuffer.sampleRate, (err, bpm, thresold) => {
            this.options.pushCallback(err, bpm, thresold);

            // Stop all (we have enougth interval counts)
            // Never executed !
            if (!err && bpm) {
              if (bpm[0].count >= this.options.stabilizedBpmCount) {
                this.logger('[freezePushBack]');
                // Freeze pushPack periodicity
                this.waitPushTime = 'never';
                // Cancel the audioprocess
                this.minValidThresold = 1;
              }
            }

            if (this.cumulatedPushTime >= this.options.computeBPMDelay &&
             this.minValidThresold < thresold
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

// Export
module.exports = RealTimeBPMAnalyzer;

// Extend tool to global window scope
window.RealTimeBPMAnalyzer = RealTimeBPMAnalyzer;
