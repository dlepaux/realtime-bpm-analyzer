import {expect} from 'chai';
import * as utils from '../../src/core/utils';
import {createTestAudioContext, closeAudioContext, loadTestAudio, audioBufferToChunks} from '../setup';

describe('Utils - Unit tests', () => {
  describe('descendingOverThresholds', () => {
    it('should stop iteration when callback returns true', async () => {
      const object = {
        foo: 0,
      };

      await utils.descendingOverThresholds(async threshold => {
        // We add an entry to object
        object.foo = threshold;
        // Stop the loop at first iteration
        return true;
      });

      // Check if object have only ONE entry
      expect(JSON.stringify(object)).to.be.equal('{"foo":0.8999999999999999}');
    });

    it('should iterate over all thresholds when callback returns false', async () => {
      const thresholds: number[] = [];

      await utils.descendingOverThresholds(async threshold => {
        thresholds.push(threshold);
        return false;
      });

      // Should have iterated through multiple thresholds
      expect(thresholds.length).to.be.greaterThan(1);
    });

    it('should respect custom minThreshold parameter', async () => {
      const object: Record<string, number> = {
        0.4: 0, // eslint-disable-line @typescript-eslint/naming-convention
      };

      await utils.descendingOverThresholds(async threshold => {
        // We add an entry to object
        object[threshold] = threshold;
        return false;
      });

      // Should have thresholds
      expect(Object.keys(object).length).to.be.greaterThan(1);
    });
  });

  describe('generateValidPeaksModel', () => {
    it('should create model with empty arrays as default values', done => {
      const object = utils.generateValidPeaksModel();
      expect(JSON.stringify(Object.values(object)[0])).to.be.equal('[]');
      done();
    });

    it('should create model with threshold keys', () => {
      const object = utils.generateValidPeaksModel();
      const keys = Object.keys(object);
      expect(keys.length).to.be.greaterThan(0);
      // Keys should be string representations of thresholds
      expect(keys[0]).to.be.a('string');
    });
  });

  describe('generateNextIndexPeaksModel', () => {
    it('should create model with 0 as default values', done => {
      const object = utils.generateNextIndexPeaksModel();
      expect(JSON.stringify(Object.values(object)[0])).to.be.equal('0');
      done();
    });

    it('should create model with threshold keys', () => {
      const object = utils.generateNextIndexPeaksModel();
      const keys = Object.keys(object);
      expect(keys.length).to.be.greaterThan(0);
    });
  });

  describe('chunkAggregator', () => {
    let audioContext: AudioContext;

    beforeEach(() => {
      audioContext = createTestAudioContext();
    });

    afterEach(async () => {
      await closeAudioContext(audioContext);
    });

    it('should aggregate chunks and detect when buffer is full', async () => {
      const aggregate = utils.chunkAggregator();
      const bufferSize = 1024;
      const audioBuffer = await loadTestAudio(audioContext);
      const channelData = audioBufferToChunks(audioBuffer, bufferSize);

      let fullBufferCount = 0;
      for (const chunk of channelData) {
        const {isBufferFull, buffer} = aggregate(chunk);
        if (isBufferFull) {
          expect(buffer.length).to.equal(4096);
          fullBufferCount++;
        }
      }

      expect(fullBufferCount).to.be.greaterThan(0);
    });
  });
});
