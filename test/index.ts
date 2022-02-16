import fs from 'node:fs';
import {expect} from 'chai';
import {describe, it} from 'mocha';
import wae from 'web-audio-engine';
import WavDecoder from 'wav-decoder';

import {loopOnThresholds, generateObjectModel} from '../src/utils.ts';
import {getLowPassSource, identifyIntervals, groupByTempo, getTopCandidates, findPeaksAtThreshold} from '../src/analyzer.ts';

/**
 * Unit test for the RealTime BPM Analyzer
 */
describe('RealTime BPM Analyzer', () => {
  /**
   * Test Utility functions
   */
  describe('Utils.loopOnThresholds', () => {
    it('should test threshold value with stop call', done => {
      loopOnThresholds((object, threshold, stop) => {
        // We add an entry to object
        object.foo = threshold;
        // Stop the loop at first iteration
        stop(true);
      }, object => {
        // Check if object have only ONE entry
        expect(JSON.stringify(object)).to.be.equal('{"foo":0.8999999999999999}');
        done();
      });
    });

    it('should test threshold value with boolean', done => {
      loopOnThresholds((object, threshold, stop) => {
        // We add an entry to object
        object.foo = threshold;
        // Stop the loop at first iteration
        stop(true);
      }, false, object => {
        expect(JSON.stringify(object)).to.be.equal('{"foo":0.8999999999999999}');
        done();
      });
    });

    it('should test threshold without minThreshold', done => {
      loopOnThresholds((object, threshold) => {
        // We add an entry to object
        object[threshold] = threshold;
      });
      setTimeout(() => {
        done();
      });
    });

    it('should test callback (second param) without onLoop', done => {
      loopOnThresholds(() => {}, object => {
        expect(JSON.stringify(object)).to.be.equal('{}');
        done();
      });
    });

    it('should test Object Model generation', done => {
      generateObjectModel(false, object => {
        expect(JSON.stringify(object)).to.be.not.equal('{}');
        done();
      });
    });

    it('should test Object Model generation', () => {
      const object = generateObjectModel(false);
      expect(typeof object).to.be.equal('object');
    });
  });

  /**
   * Test Analyzer functions
   */

  describe('Analyzer', () => {
    it('should test low pass filter applying', done => {
      const AudioContext = wae.StreamAudioContext;
      const audioContext = new AudioContext();
      // Create an empty three-second stereo buffer at the sample rate of the AudioContext
      const buffer = audioContext.createBuffer(2, audioContext.sampleRate * 3, audioContext.sampleRate);
      // Fill the buffer with white noise;
      // just random values between -1.0 and 1.0
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        // This gives us the actual array that contains the data
        const nowBuffering = buffer.getChannelData(channel);
        for (let i = 0; i < buffer.length; i++) {
          // Math.random() is in [0; 1.0]
          // audio needs to be in [-1.0; 1.0]
          nowBuffering[i] = (Math.random() * 2) - 1;
        }
      }

      expect(buffer.constructor.name).to.be.equal('AudioBuffer');
      const OfflineAudioContext = wae.OfflineAudioContext;
      const source = getLowPassSource(buffer, OfflineAudioContext);
      expect(source.buffer.constructor.name).to.be.equal('AudioBuffer');
      done();
    });

    const passLowPassFilter = callback => {
      wae.decoder.set('wav', WavDecoder);

      const AudioContext = wae.RenderingAudioContext;
      const context = new AudioContext();

      fs.readFile('test/fixtures/bass-test.wav', (error, buffer) => {
        if (error) {
          console.log(error);
        }

        context.decodeAudioData(buffer).then(audioBuffer => {
          expect(audioBuffer.constructor.name).to.be.equal('AudioBuffer');

          const OfflineAudioContext = wae.OfflineAudioContext;
          const source = getLowPassSource(audioBuffer, OfflineAudioContext);

          expect(source.buffer.constructor.name).to.be.equal('AudioBuffer');

          if (callback) {
            callback({source, sampleRate: context.sampleRate});
          }
        }).catch(error => {
          if (callback) {
            callback(null, error);
          }
        });
      });
    };

    it('should test lowpass filter', done => {
      passLowPassFilter((data, error) => {
        if (error) {
          done(error);
        } else {
          done();
        }
      });
    });

    it('should test lowpass filter + findPeaksAtThreshold', done => {
      passLowPassFilter((data, error) => {
        if (error) {
          done(error);
        }

        const threshold = 0.8;
        const offset = 0;

        const {peaks, threshold: returnedThreshold} = findPeaksAtThreshold(data.source.buffer.getChannelData(0), threshold, offset);

        expect(peaks.length).to.be.not.equal(0);
        expect(threshold).to.be.equal(returnedThreshold);

        /**
         * Try to get the BPM
         */
        const intervals = identifyIntervals(peaks);
        const fn = groupByTempo(data.sampleRate);
        const candidates = fn(intervals);
        const bpm = getTopCandidates(candidates);

        expect(bpm.length).to.be.not.equal(0);
        expect(bpm[0].tempo).to.be.equal(125);
        expect(bpm[0].count).to.be.equal(9);

        done();
      });
    });

    it('should test lowpass filter + findPeaksAtThreshold at 1.1 (no peaks hit)', done => {
      passLowPassFilter((data, error) => {
        if (error) {
          done(error);
        }

        const threshold = 1.1;
        const offset = 0;

        const {peaks, threshold: returnedThreshold} = findPeaksAtThreshold(data.source.buffer.getChannelData(0), threshold, offset);

        expect(peaks).to.be.equal(undefined);
        expect(threshold).to.be.equal(returnedThreshold);
        done();
      });
    });
  });
});
