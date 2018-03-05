'use strict';

const OfflineContext = (window.OfflineAudioContext || window.webkitOfflineAudioContext);

/**
 * RealTimeBPMAnalyzer Class
 */
var RealTimeBPMAnalyzer = function () {

  /**
   * [constructor description]
   * @param  {Object} config [description]
   * @return {[type]}        [description]
   */
  constructor (config = {}) {
    // Default configuration
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
    
    // Overriding default configuration
    Object.assign(this.options, config);
  }

  /**
   * [initClass description]
   * @return {[type]} [description]
   */
  initClass () {
    this.wait = null;
    this.validPeaks = this.generateDataModel();
    this.nextIndexPeaks = this.generatePeakIndexModel();
    this.chunkIndex = 1;
  }

  /**
   * [loopOnThresolds description]
   * @param  {[type]}   onLoop   [description]
   * @param  {Function} callback [description]
   * @return {[type]}            [description]
   */
  loopOnThresolds (onLoop, callback) {

    /**
     * Top starting value to check peaks
     */

    let thresold = 0.95;

    /**
     * Minimum value to check peaks
     */

    const minThresold = 0.30;

    let object = {};

    do {
      thresold = thresold - 0.05;
      onLoop && onLoop(object);
    } while (thresold > minThresold);
    
    return callback && callback(object);
  }

  /**
   * [generateDataModel description]
   * @return {[type]} [description]
   */
  generateDataModel () {
    return loopOnThresolds((object) => {
      object[thresold.toString()] = [];
    }, (object) => {
      return object;
    });
  }

  /**
   * [generatePeakIndexModel description]
   * @return {[type]} [description]
   */
  generatePeakIndexModel () {
    return loopOnThresolds((object) => {
      object[thresold.toString()] = 0;
    }, (object) => {
      return object;
    });
  }

  /**
   * [onAudioProcess description]
   * @return {[type]} [description]
   */
  onAudioProcess (event) {
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
    const source = getLowPassSource(event.inputBuffer);
    source.start(0);



    loopOnThresolds((object) => {
      if (this.nextIndexPeaks[thresold] < currentMaxIndex) {
        // Get the next index in the next chunk
        const offsetForNextPeak = this.nextIndexPeaks[thresold] % 4096; // 0 - 4095
        // Get peaks sort by tresold
        findPeaksAtThresold(source.buffer.getChannelData(0), thresold, offsetForNextPeak, (peaks) => {
          // Loop over peaks
          if (typeof(peaks) != 'undefined' && peaks != undefined) {
            Object.keys(peaks).forEach( (key) => {
              // If we got some data..
              const relativeChunkPeak = peaks[key];

              if (typeof(relativeChunkPeak) != 'undefined') {
                // Add current Index + 10K
                this.nextIndexPeaks[thresold] = currentMinIndex + relativeChunkPeak + 10000;
                // Store valid relativeChunkPeak
                this.validPeaks[thresold].push(currentMinIndex + relativeChunkPeak);
              }
            });
          } else {
          }

        });
      }
    });

    // Refresh BPM every 2s (default value)
    if (this.wait === null) {
      this.wait = setTimeout( () => {
        this.wait = null;
        computeBPM(this.validPeaks, event.inputBuffer.sampleRate, (err, bpm) => {
          this.options.pushCallback(err, bpm);
        });
      }, this.options.pushTime);
    }

    // Increment chunk index
    this.chunkIndex++;
  }


  /**
   * [getLowPassSource description]
   * @param  {AudioBuffer} buffer    A simple AudioBuffer
   * @return {AudioBufferSourceNode}
   */
  function getLowPassSource(buffer) {
    const {length, numberOfChannels, sampleRate} = buffer;
    const offlineContext = new OfflineContext(numberOfChannels, length, sampleRate);

    /**
     * Create buffer source
     */
    const source = offlineContext.createBufferSource();
    source.buffer = buffer;

    /**
     * Create filter
     */
    const filter = offlineContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 100; // instead of break frequency 70% of max amplitude

    /**
     * Pipe the song into the filter, and the filter into the offline context
     */
    source.connect(filter);
    filter.connect(offlineContext.destination);

    return source;
  }


  /**
   * Function to identify peaks
   * @param  {Array}  data     Buffer channel data
   * @param  {Number} thresold Thresold for qualifying as a peak
   * @return {Array}           Peaks found that are grater than the thresold
   */
  function findPeaksAtThresold(data, thresold, offset = 0, callback) {
    let peaks = [];

    /**
     * Identify peaks that pass the thresold, adding them to the collection
     */
    for (var i = offset, l = data.length; i < l; i += 1) {
      if (data[i] > thresold) {
        peaks.push(i);

        /**
         * Skip forward ~ 1/4s to get past this peak
         */
        i += 10000;
      }
    }

    peaks = peaks.length == 0 ? undefined :peaks;

    return callback && callback(peaks) || peaks;
  }

  /**
   * Return in a callback the computed bpm from data
   * @param  {[type]}   data     [description]
   * @param  {Function} callback [description]
   * @return {[type]}            [description]
   */
  function computeBPM (data, callback) {
    /**
     * Minimum peaks
     */
    const minPeaks = 15;

    /**
     * Flag to fix Object.keys looping
     */
    let peaksFound = false;

    /**
     * Top starting value to check peaks
     */

    let thresold = 0.95;

    /**
     * Minimum value to check peaks
     */

    const minThresold = 0.30;

    /**
     * Keep looking for peaks lowering the thresold
     */
    
    do {
      thresold = thresold - 0.05;

      if (data[thresold].length > minPeaks) {

        peaksFound = true;
        return callback(null, [
          identifyIntervals,
          groupByTempo(48000),
          getTopCandidates
        ].reduce(
         (state, fn) => fn(state),
          data[thresold]
        ));
      }
    } while (thresold > minThresold && ! peaksFound);

    return callback(new Error('Could not find enough samples for a reliable detection.'))
  };


  /**
   * Sort results by count and return top candidate
   * @param  {Object} Candidate
   * @return {Number}
   */

  function getTopCandidates(candidates) {
    return candidates.sort((a, b) => (b.count - a.count)).splice(0, 5);
  }


  /**
   * Identify intervals between peaks
   * @param  {Array} peaks Array of qualified peaks
   * @return {Array}       Identifies intervals between peaks
   */
  function identifyIntervals(peaks) {
    const intervals = [];
    peaks.forEach((peak, index) => {
      for (let i = 0; i < 10; i+= 1) {
        let interval = peaks[index + i] - peak;

        /**
         * Try and find a matching interval and increase it's count
         */

        let foundInterval = intervals.some(intervalCount => {
          if (intervalCount.interval === interval) {
            return intervalCount.count += 1;
          }
        });

        /**
         * Add the interval to the collection if it's unique
         */

        if (!foundInterval) {
          intervals.push({
            interval: interval,
            count: 1
          });
        }
      }
    });
    return intervals;
  }

  /**
   * Factory for group reducer
   * @param  {Number} sampleRate Audio sample rate
   * @return {Function}
   */
  function groupByTempo(sampleRate) {
    /**
     * Figure out best possible tempo candidates
     * @param  {Array} intervalCounts List of identified intervals
     * @return {Array}                Intervals grouped with similar values
     */

    return (intervalCounts) => {
      const tempoCounts = [];

      intervalCounts.forEach(intervalCount => {
        if (intervalCount.interval !== 0) {

          /**
           * Convert an interval to tempo
           */

          let theoreticalTempo = (60 / (intervalCount.interval / sampleRate));
          
          /**
           * Adjust the tempo to fit within the 90-180 BPM range
           */

          while (theoreticalTempo < 90) theoreticalTempo *= 2;
          while (theoreticalTempo > 180) theoreticalTempo /= 2;

          /**
           * Round to legible integer
           */

          theoreticalTempo = Math.round(theoreticalTempo);

          /**
           * See if another interval resolved to the same tempo
           */

          let foundTempo = tempoCounts.some(tempoCount => {
            if (tempoCount.tempo === theoreticalTempo) {
              return tempoCount.count += intervalCount.count;
            }
          });

          /**
           * Add a unique tempo to the collection
           */
          
          if (!foundTempo) {
            tempoCounts.push({
              tempo: theoreticalTempo,
              count: intervalCount.count
            });
          }
        }
      });

      return tempoCounts;
    }
  }
}
