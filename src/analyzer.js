'use strict';

const utils = require('./utils');



/**
 * Contain analyzer functions
 */

const analyzer = {};



/**
 * Apply a low pass filter to an AudioBuffer
 * @param  {AudioBuffer}            buffer Source AudioBuffer
 * @return {AudioBufferSourceNode}
 */

analyzer.getLowPassSource = function (buffer, OfflineContext) {
  const {length, numberOfChannels, sampleRate} = buffer;
  const context = new OfflineContext(numberOfChannels, length, sampleRate);

  /**
   * Create buffer source
   */

  const source = context.createBufferSource();
  source.buffer = buffer;

  /**
   * Create filter
   */

  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  // Instead of break frequency 70% of max amplitude
  // filter.frequency.value = 100;

  /**
   * Pipe the song into the filter, and the filter into the offline context
   */

  source.connect(filter);
  filter.connect(context.destination);

  return source;
};



/**
 * Peaks finder
 * @param  {Array}    data     Buffer channel data
 * @param  {Float}    thresold Thresold for qualifying as a peak
 * @param  {Integer}  offset   Position where we start to loop
 * @param  {Function} callback Return peaks
 * @return {Array}             Peaks found that are grater than the thresold
 */

analyzer.findPeaksAtThresold = function (data, thresold, offset, callback) {
  let peaks = [];

  /**
   * Identify peaks that pass the thresold, adding them to the collection
   */

  for (let i = offset, l = data.length; i < l; i += 1) {
    if (data[i] > thresold) {
      peaks.push(i);

      /**
       * Skip forward ~ 1/4s to get past this peak
       */
      i += 10000;
    }
  }

  if (peaks.length === 0) {
    peaks = undefined;
  }

  if (callback) {
    return callback(peaks, thresold);
  }

  return peaks;
};



/**
 * Return in a callback the computed bpm from data
 * @param  {Object}   data     Contain peaks per thresolds
 * @param  {Function} callback (error, bpm)
 */

analyzer.computeBPM = function (data, sampleRate, callback) {
  /**
   * Minimum peaks
   */

  const minPeaks = 15;

  /**
   * Flag to fix Object.keys looping
   */

  let peaksFound = false;

  utils.loopOnThresolds((object, thresold, stop) => {
    if (peaksFound) {
      return stop(true);
    }

    if (data[thresold].length > minPeaks) {
      peaksFound = true;
      return callback(null, [
        analyzer.identifyIntervals,
        analyzer.groupByTempo(sampleRate),
        analyzer.getTopCandidates
      ].reduce(
        (state, fn) => fn(state),
        data[thresold]
      ), thresold);
    }
  }, () => {
    if (!peaksFound) {
      callback(new Error('Could not find enough samples for a reliable detection.'));
    }

    return false;
  });
};



/**
 * Sort results by count and return top candidate
 * @param  {Object} Candidate (BPMs) with count
 * @return {Number}
 */

analyzer.getTopCandidates = function (candidates) {
  return candidates.sort((a, b) => (b.count - a.count)).splice(0, 5);
};



/**
 * Identify intervals between peaks
 * @param  {Array} peaks Array of qualified peaks
 * @return {Array}       Identifies intervals between peaks
 */

analyzer.identifyIntervals = function (peaks) {
  const intervals = [];
  peaks.forEach((peak, index) => {
    for (let i = 0; i < 10; i += 1) {
      const interval = peaks[index + i] - peak;

      /**
       * Try and find a matching interval and increase it's count
       */

      const foundInterval = intervals.some(intervalCount => {
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
        intervals.push({
          interval,
          count: 1
        });
      }
    }
  });
  return intervals;
};



/**
 * Factory for group reducer
 * @param  {Number} sampleRate Audio sample rate
 * @return {Function}
 */

analyzer.groupByTempo = function (sampleRate) {
  /**
   * Figure out best possible tempo candidates
   * @param  {Array} intervalCounts List of identified intervals
   * @return {Array}                Intervals grouped with similar values
   */

  return intervalCounts => {
    const tempoCounts = [];

    intervalCounts.forEach(intervalCount => {
      if (intervalCount.interval !== 0) {
        intervalCount.interval = Math.abs(intervalCount.interval);

        /**
         * Convert an interval to tempo
         */

        let theoreticalTempo = (60 / (intervalCount.interval / sampleRate));
        /**
         * Adjust the tempo to fit within the 90-180 BPM range
         */

        while (theoreticalTempo < 90) {
          theoreticalTempo *= 2;
        }

        while (theoreticalTempo > 180) {
          theoreticalTempo /= 2;
        }

        /**
         * Round to legible integer
         */

        theoreticalTempo = Math.round(theoreticalTempo);

        /**
         * See if another interval resolved to the same tempo
         */

        const foundTempo = tempoCounts.some(tempoCount => {
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
          tempoCounts.push({
            tempo: theoreticalTempo,
            count: intervalCount.count
          });
        }
      }
    });
    return tempoCounts;
  };
};



/**
 * Export utils function container
 */

module.exports = analyzer;
