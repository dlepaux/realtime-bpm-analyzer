'use strict';

/**
 * Get expect function for testing
 */
import {expect} from 'chai';
import path from 'path';
import {describe, it} from 'mocha';
import utils from '../src/utils';
import analyzer from '../src/analyzer';
const wae = require('web-audio-engine');
const WavDecoder = require('wav-decoder');

/**
 * Unit test for the RealTime BPM Analyzer
 */

describe('RealTime BPM Analyzer', () => {
  /**
   * Test Utility functions
   */

  describe('Utils.loopOnThresolds', () => {
    it('Test thresold value with stop call', done => {
      utils.loopOnThresolds((object, thresold, stop) => {
        // We add an entry to object
        object.foo = thresold;
        // Stop the loop at first iteration
        stop(true);
      }, object => {
        // Check if object have only ONE entry
        expect(JSON.stringify(object)).to.be.equal('{"foo":0.8999999999999999}');
        done();
      });
    });

    it('Test thresold value with boolean', done => {
      utils.loopOnThresolds((object, thresold, stop) => {
        // We add an entry to object
        object.foo = thresold;
        // Stop the loop at first iteration
        stop(true);
      }, false, object => {
        expect(JSON.stringify(object)).to.be.equal('{"foo":0.8999999999999999}');
        done();
      });
    });

    it('Test thresold without minThresold', done => {
      utils.loopOnThresolds((object, thresold) => {
        // We add an entry to object
        object[thresold] = thresold;
      });
      setTimeout(() => {
        done();
      });
    });

    it('Test callback (second param) without onLoop', done => {
      utils.loopOnThresolds(() => {}, object => {
        expect(JSON.stringify(object)).to.be.equal('{}');
        done();
      });
    });

    it('Test Object Model generation', done => {
      utils.generateObjectModel(false, object => {
        expect(JSON.stringify(object)).to.be.not.equal('{}');
        done();
      });
    });
  });


  /**
   * Test Analyzer functions
   */

  describe('Analyzer', () => {
    it('Test low pass filter applying', done => {
      const AudioContext = require('web-audio-engine').StreamAudioContext;
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
      const OfflineAudioContext = require('web-audio-engine').OfflineAudioContext;
      const source = analyzer.getLowPassSource(buffer, OfflineAudioContext);
      expect(source.buffer.constructor.name).to.be.equal('AudioBuffer');
      done();
    });


    const passLowPassFilter = callback => {
      wae.decoder.set('wav', WavDecoder);

      const fs = require('fs');
      const AudioContext = require('web-audio-engine').RenderingAudioContext;
      const context = new AudioContext();
      fs.readFile(path.resolve(__dirname, 'fixtures', 'bass-test.wav'), (error, buffer) => {
        if (error) {
          console.log(error);
        }

        context.decodeAudioData(buffer).then(audioBuffer => {
          expect(audioBuffer.constructor.name).to.be.equal('AudioBuffer');

          const OfflineAudioContext = require('web-audio-engine').OfflineAudioContext;
          const source = analyzer.getLowPassSource(audioBuffer, OfflineAudioContext);

          expect(source.buffer.constructor.name).to.be.equal('AudioBuffer');

          if (callback) {
            callback(source);
          }
        }).catch(error => {
          if (callback) {
            callback(null, error);
          }
        });
      });
    };



    it('Test lowpass filter', done => {
      passLowPassFilter((soruce, err) => {
        if (err) {
          done(err);
        } else {
          done();
        }
      });
    });


    it('Test lowpass filter + findPeaksAtThresold', done => {
      passLowPassFilter((source, err) => {
        if (err) {
          done(err);
        }

        const thresold = 0.8;
        const offset = 0;

        analyzer.findPeaksAtThresold(source.buffer.getChannelData(0), thresold, offset, (peaks, returnedThresold) => {
          expect(peaks.length).to.be.not.equal(0);
          expect(thresold).to.be.equal(returnedThresold);
          done();
        });
      });
    });

    it('Test lowpass filter + findPeaksAtThresold at 1.1 (no peaks hit)', done => {
      passLowPassFilter((source, err) => {
        if (err) {
          done(err);
        }

        const thresold = 1.1;
        const offset = 0;

        analyzer.findPeaksAtThresold(source.buffer.getChannelData(0), thresold, offset, (peaks, returnedThresold) => {
          expect(peaks).to.be.equal(undefined);
          expect(thresold).to.be.equal(returnedThresold);
          done();
        });
      });
    });
  });
});
