import {findPeaksAtThreshold, computeBpm} from './analyzer';
import type {StrobeAnalyzerOptions, StrobeAnalyzerParameters, ValidPeaks, NextIndexPeaks, BpmCandidates, Peaks} from './types';
import {generateValidPeaksModel, generateNextIndexPeaksModel, descendingOverThresholds} from './utils';

/**
 * @class StrobeAnalyzer
 **/
export class StrobeAnalyzer {
  /**
   * Default configuration
   */
  options: StrobeAnalyzerOptions = {
    threshold: 0.5,
    minTimeBetweenBump: 100,
  };

  currentAmplitude = 0;
  previousAmplitude = 0;
  previousBumpTime = 0;

  /**
   * @constructor
   * @param {object} config Configuration
   * @param {boolean} config.continuousAnalysis Flag indicating if we need to analyze continuously, typically used for streams
   * @param {number} config.computeBpmDelay Arbitrary delay to compute the BPM for the first time
   * @param {number} config.stabilizationTime Arbitrary time where we consider that a BPM is computable
   */
  constructor(config: StrobeAnalyzerParameters = {}) {
    /**
     * Overriding default configuration
     */
    Object.assign(this.options, config);
  }

  /**
   * Method to apply a configuration on the fly
   * @param {string} key Key of the configuration in this.options
   * @param {unknown} value The value you need to set
   * @returns {void}
   */
  setAsyncConfiguration(key: string, value: unknown): void {
    if (typeof this.options[key] === 'undefined') {
      console.log('Key not found in options', key);
      return;
    }

    this.options[key] = value;
  }

  /**
   * Attach this function to an audioprocess event on a audio/video node to compute BPM / Tempo in realtime
   * @param {Float32Array} channelData Channel data
   * @param {number} audioSampleRate Audio sample rate
   * @param {number} bufferSize Buffer size
   * @param {(data: any) => void} postMessage Function to post a message to the processor node
   * @returns {Promise<void>}
   */
  async analyzeChunck(channelData: Float32Array, audioSampleRate: number, postMessage: (data: any) => void): Promise<void> {
    // Calculate the current amplitude
    this.currentAmplitude = this.getAmplitude(channelData);

    // Check if the current amplitude is above the threshold and if enough time has passed since the last beat hit
    if (this.currentAmplitude > this.options.threshold && Date.now() - this.previousBumpTime > this.options.minTimeBetweenBump) {
      // Trigger the BEAT_HIT event
      postMessage({message: 'BASS_HIT', data: {
        currentAmplitude: this.currentAmplitude,
        threshold: this.options.threshold,
        previousBumpTime: this.previousBumpTime,
        minTimeBetweenBump: this.options.minTimeBetweenBump,
        previousAmplitude: this.previousAmplitude,
      }});

      // Update the previous beat time
      this.previousBumpTime = Date.now();
    }

    this.previousAmplitude = this.currentAmplitude;
  }

  // Create a helper function to calculate the amplitude from the data
  getAmplitude(data: Float32Array) {
    let max = 0;
    for (const datum of data) {
      const amplitude = Math.abs(datum);
      if (amplitude > max) {
        max = amplitude;
      }
    }

    return max;
  }
}
