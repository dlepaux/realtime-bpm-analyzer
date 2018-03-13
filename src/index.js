'use strict';

import analyzer from "./analyzer";
import utils from "./utils";

/**
 * RealTimeBPMAnalyzer Class
 */
var RealTimeBPMAnalyzer = function () {


  /**
   * Define default configuration
   * @param  {Object} config Configuration
   */
  
  constructor (config = {}) {

    /**
     * Default configuration
     * @type {Object}
     */
    
    this.options = {
      element: null,
      scriptNode: {
        bufferSize: 4096,
        numberOfInputChannels: 1,
        numberOfOutputChannels: 1
      },
      pushTime: 2000,
      pushCallback: (err, bpm) => {
        console.log('bpm', bpm);
      }
    }

    /**
     * Overriding default configuration
     */
    
    Object.assign(this.options, config);

    /**
     * Initialize variables and thresolds object's
     */
    
    initClass();
  }



  /**
   * Instentiate some vars, counter, ..
   * @return {[type]} [description]
   */
  
  initClass () {

    /**
     * Used to temporize the BPM computation
     */
    
    this.wait = null;

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
    
    this.chunkIndex = 1;
  }



  /**
   * Attach this function to an audioprocess event on a audio/video node to compute BPM / Tempo in realtime
   */
  
  analyze (event) {

    /**
     * Compute the maximum index with all previous chunks
     * @type {integer}
     */
    const currentMaxIndex = this.options.scriptNode.bufferSize * this.chunkIndex;

    /**
     * Compute the minimum index with all previous chunks
     * @type {integer}
     */
    const currentMinIndex = currentMaxIndex - this.options.scriptNode.bufferSize;

    /**
     * Apply a low pass filter to the buffer
     * @type {integer}
     */
    const source = analyzer.getLowPassSource(event.inputBuffer);
    source.start(0);


    utils.loopOnThresolds((object) => {
      if (this.nextIndexPeaks[thresold] < currentMaxIndex) {
        // Get the next index in the next chunk
        const offsetForNextPeak = this.nextIndexPeaks[thresold] % 4096; // 0 - 4095
        // Get peaks sort by tresold
        analyzer.findPeaksAtThresold(source.buffer.getChannelData(0), thresold, offsetForNextPeak, (peaks) => {
          // Loop over peaks
          if (typeof(peaks) != 'undefined' && peaks != undefined) {
            Object.keys(peaks).forEach((key) => {
              // If we got some data..
              const relativeChunkPeak = peaks[key];

              if (typeof(relativeChunkPeak) != 'undefined') {
                // Add current Index + 10K
                this.nextIndexPeaks[thresold] = currentMinIndex + relativeChunkPeak + 10000;
                // Store valid relativeChunkPeak
                this.validPeaks[thresold].push(currentMinIndex + relativeChunkPeak);
              }
            });
          }
        });
      }
    });

    // Refresh BPM every 2s (default value)
    if (this.wait === null) {
      this.wait = setTimeout(() => {
        this.wait = null;
        analyzer.computeBPM(this.validPeaks, event.inputBuffer.sampleRate, (err, bpm) => {
          this.options.pushCallback(err, bpm);
        });
      }, this.options.pushTime);
    }

    // Increment chunk index
    this.chunkIndex++;
  }
}
