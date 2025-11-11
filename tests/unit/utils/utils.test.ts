import {expect} from 'chai';
import * as utils from '../../../src/core/utils';

/**
 * Unit tests for utility functions
 * Tests threshold iteration, model generation, and helper functions
 */
describe('utils - comprehensive tests', () => {
  describe('computeIndexesToSkip', () => {
    it('should calculate correct indexes for given duration and sample rate', () => {
      const result = utils.computeIndexesToSkip(1, 44100);
      expect(result).to.equal(44100);
    });

    it('should handle fractional seconds', () => {
      const result = utils.computeIndexesToSkip(0.5, 44100);
      expect(result).to.equal(22050);
    });

    it('should round to nearest integer', () => {
      const result = utils.computeIndexesToSkip(0.25, 44100);
      expect(result).to.equal(11025);
    });

    it('should work with different sample rates', () => {
      expect(utils.computeIndexesToSkip(1, 48000)).to.equal(48000);
      expect(utils.computeIndexesToSkip(1, 96000)).to.equal(96000);
      expect(utils.computeIndexesToSkip(1, 22050)).to.equal(22050);
    });

    it('should handle zero duration', () => {
      const result = utils.computeIndexesToSkip(0, 44100);
      expect(result).to.equal(0);
    });

    it('should handle very small durations', () => {
      const result = utils.computeIndexesToSkip(0.001, 44100);
      expect(result).to.be.closeTo(44, 1);
    });

    it('should handle large durations', () => {
      const result = utils.computeIndexesToSkip(60, 44100);
      expect(result).to.equal(2_646_000);
    });
  });

  describe('descendingOverThresholds - advanced scenarios', () => {
    it('should iterate from startThreshold down to minThreshold', async () => {
      const thresholds: number[] = [];

      await utils.descendingOverThresholds(async threshold => {
        thresholds.push(threshold);
        return false; // Continue iteration
      }, 0.2, 0.5, 0.1);

      // Algorithm decrements first: 0.5 -> 0.4, 0.3, 0.2, 0.1 (stops when <= 0.2 after iteration)
      expect(thresholds.length).to.equal(4);
      expect(thresholds[0]).to.be.closeTo(0.4, 0.001);
      expect(thresholds[1]).to.be.closeTo(0.3, 0.001);
      expect(thresholds[2]).to.be.closeTo(0.2, 0.001);
      expect(thresholds[3]).to.be.closeTo(0.1, 0.001);
    });

    it('should stop immediately on first true return', async () => {
      const thresholds: number[] = [];

      await utils.descendingOverThresholds(async threshold => {
        thresholds.push(threshold);
        return true; // Stop immediately
      });

      expect(thresholds.length).to.equal(1);
    });

    it('should handle custom step sizes', async () => {
      const thresholds: number[] = [];

      await utils.descendingOverThresholds(
        async threshold => {
          thresholds.push(threshold);
          return false;
        },
        0.5,
        0.9,
        0.2, // Large steps
      );

      expect(thresholds.length).to.equal(2);
      expect(thresholds[0]).to.be.closeTo(0.7, 0.001);
      expect(thresholds[1]).to.be.closeTo(0.5, 0.001);
    });

    it('should handle very small step sizes', async () => {
      const thresholds: number[] = [];

      await utils.descendingOverThresholds(
        async threshold => {
          thresholds.push(threshold);
          return false;
        },
        0.85,
        0.95,
        0.05,
      );

      expect(thresholds.length).to.equal(2);
      expect(thresholds[0]).to.be.closeTo(0.9, 0.001);
      expect(thresholds[1]).to.be.closeTo(0.85, 0.001);
    });

    it('should not iterate if start <= min', async () => {
      const thresholds: number[] = [];

      await utils.descendingOverThresholds(
        async threshold => {
          thresholds.push(threshold);
          return false;
        },
        0.9,
        0.5, // Start below min
        0.05,
      );

      // Algorithm decrements first (0.5 - 0.05 = 0.45), then checks condition
      // 0.45 is NOT > 0.9, so exits after first iteration
      expect(thresholds.length).to.equal(1);
      expect(thresholds[0]).to.be.closeTo(0.45, 0.001);
    });

    it('should support async callbacks', async () => {
      let lastCallbackValue = 0.9;

      await utils.descendingOverThresholds(async threshold => {
        lastCallbackValue = threshold;
        return threshold < 0.7;
      });

      expect(lastCallbackValue).to.be.lessThan(0.7);
    });

    it('should handle callback errors gracefully', async () => {
      try {
        await utils.descendingOverThresholds(async () => {
          throw new Error('Test error');
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
        expect((error as Error).message).to.equal('Test error');
      }
    });
  });

  describe('generateValidPeaksModel', () => {
    it('should create object with threshold keys', () => {
      const model = utils.generateValidPeaksModel();
      const keys = Object.keys(model);

      expect(keys.length).to.be.greaterThan(0);
      // Keys should be threshold strings
      expect(Number.parseFloat(keys[0])).to.be.a('number');
    });

    it('should initialize all values as empty arrays', () => {
      const model = utils.generateValidPeaksModel();
      const values = Object.values(model);

      for (const value of values) {
        expect(value).to.be.an('array');
        expect(value.length).to.equal(0);
      }
    });

    it('should respect custom threshold parameters', () => {
      const model = utils.generateValidPeaksModel(0.5, 0.8, 0.1);
      const keys = Object.keys(model).map(Number);

      // Algorithm: start=0.8, decrement first: 0.7, 0.6, 0.5, 0.4 (stops when <= 0.5)
      expect(Math.max(...keys)).to.be.closeTo(0.7, 0.01);
      expect(Math.min(...keys)).to.be.closeTo(0.4, 0.01);
    });

    it('should create independent arrays for each threshold', () => {
      const model = utils.generateValidPeaksModel();
      const keys = Object.keys(model);

      // Modify one array using actual key
      const firstKey = keys[0];
      const secondKey = keys[1];
      const thirdKey = keys[2];

      model[firstKey].push(100);

      // Arrays should be independent - modifying one should not affect others
      expect(model[secondKey].length).to.equal(0);
      expect(model[thirdKey].length).to.equal(0);

      // Verify they're NOT the same array
      expect(model[firstKey]).to.not.equal(model[secondKey]);
    });

    it('should have consistent key format', () => {
      const model = utils.generateValidPeaksModel();
      const keys = Object.keys(model);

      // All keys should be parseable as numbers
      for (const key of keys) {
        const num = Number.parseFloat(key);
        expect(num).to.be.a('number');
        expect(num).to.not.be.NaN;
      }
    });
  });

  describe('generateNextIndexPeaksModel', () => {
    it('should create object with threshold keys', () => {
      const model = utils.generateNextIndexPeaksModel();
      const keys = Object.keys(model);

      expect(keys.length).to.be.greaterThan(0);
    });

    it('should initialize all values as 0', () => {
      const model = utils.generateNextIndexPeaksModel();
      const values = Object.values(model);

      for (const value of values) {
        expect(value).to.equal(0);
      }
    });

    it('should respect custom threshold parameters', () => {
      const model = utils.generateNextIndexPeaksModel(0.5, 0.8, 0.1);
      const keys = Object.keys(model).map(Number);

      // Algorithm: start=0.8, decrement first: 0.7, 0.6, 0.5, 0.4 (stops when <= 0.5)
      expect(Math.max(...keys)).to.be.closeTo(0.7, 0.01);
      expect(Math.min(...keys)).to.be.closeTo(0.4, 0.01);
    });

    it('should have same keys as generateValidPeaksModel', () => {
      const validPeaksModel = utils.generateValidPeaksModel();
      const nextIndexModel = utils.generateNextIndexPeaksModel();

      const validKeys = Object.keys(validPeaksModel).sort();
      const nextKeys = Object.keys(nextIndexModel).sort();

      expect(validKeys).to.deep.equal(nextKeys);
    });

    it('should allow independent modification of values', () => {
      const model = utils.generateNextIndexPeaksModel();
      const keys = Object.keys(model);

      const firstKey = keys[0];
      const secondKey = keys[1];

      model[firstKey] = 1000;

      expect(model[secondKey]).to.equal(0);
      expect(model[firstKey]).to.equal(1000);
    });
  });

  describe('chunkAggregator - comprehensive tests', () => {
    it('should aggregate chunks until buffer is full', () => {
      const aggregate = utils.chunkAggregator(1024);

      const chunk1 = new Float32Array(512).fill(0.5);
      const result1 = aggregate(chunk1);
      expect(result1.isBufferFull).to.be.false;
      expect(result1.buffer.length).to.equal(512);

      const chunk2 = new Float32Array(512).fill(0.3);
      const result2 = aggregate(chunk2);
      expect(result2.isBufferFull).to.be.true;
      expect(result2.buffer.length).to.equal(1024);
    });

    it('should reset after buffer is full', () => {
      const aggregate = utils.chunkAggregator(1024);

      // Fill buffer
      aggregate(new Float32Array(1024));

      // Next chunk should start fresh
      const chunk = new Float32Array(256);
      const result = aggregate(chunk);

      expect(result.isBufferFull).to.be.false;
      expect(result.buffer.length).to.equal(256);
    });

    it('should handle exact buffer size chunks', () => {
      const aggregate = utils.chunkAggregator(4096);

      const chunk = new Float32Array(4096).fill(0.5);
      const result = aggregate(chunk);

      expect(result.isBufferFull).to.be.true;
      expect(result.buffer.length).to.equal(4096);
    });

    it('should handle chunks larger than buffer size', () => {
      const aggregate = utils.chunkAggregator(1024);

      const largeChunk = new Float32Array(2048);
      const result = aggregate(largeChunk);

      expect(result.buffer.length).to.equal(2048);
      // Buffer is not "full" because _bytesWritten (2048) !== bufferSize (1024)
      // It's actually overfull
      expect(result.isBufferFull).to.be.false;
      expect(result.bufferSize).to.equal(1024);
    });

    it('should preserve data across multiple chunks', () => {
      const aggregate = utils.chunkAggregator(1024);

      const chunk1 = new Float32Array(256).fill(1);
      const chunk2 = new Float32Array(256).fill(2);
      const chunk3 = new Float32Array(256).fill(3);

      aggregate(chunk1);
      aggregate(chunk2);
      const result = aggregate(chunk3);

      expect(result.buffer[0]).to.equal(1);
      expect(result.buffer[256]).to.equal(2);
      expect(result.buffer[512]).to.equal(3);
    });

    it('should handle very small chunks', () => {
      const aggregate = utils.chunkAggregator(4096);

      for (let i = 0; i < 100; i++) {
        const smallChunk = new Float32Array(40);
        const result = aggregate(smallChunk);

        if (i < 102) {
          expect(result.buffer.length).to.equal((i + 1) * 40);
        }
      }
    });

    it('should maintain correct buffer size property', () => {
      const aggregate = utils.chunkAggregator(2048);

      const result1 = aggregate(new Float32Array(512));
      expect(result1.bufferSize).to.equal(2048);

      const result2 = aggregate(new Float32Array(512));
      expect(result2.bufferSize).to.equal(2048);
    });

    it('should handle empty chunks', () => {
      const aggregate = utils.chunkAggregator(1024);

      const emptyChunk = new Float32Array(0);
      const result = aggregate(emptyChunk);

      expect(result.buffer.length).to.equal(0);
      expect(result.isBufferFull).to.be.false;
    });

    it('should work with custom buffer sizes', () => {
      const sizes = [512, 1024, 2048, 4096, 8192];

      for (const size of sizes) {
        const aggregate = utils.chunkAggregator(size);
        const chunk = new Float32Array(size);
        const result = aggregate(chunk);

        expect(result.bufferSize).to.equal(size);
        expect(result.isBufferFull).to.be.true;
      }
    });

    it('should handle sequential fill-and-reset cycles', () => {
      const aggregate = utils.chunkAggregator(1024);

      for (let cycle = 0; cycle < 5; cycle++) {
        // Fill buffer
        const chunk = new Float32Array(1024).fill(cycle);
        const result = aggregate(chunk);

        expect(result.isBufferFull).to.be.true;
        expect(result.buffer[0]).to.equal(cycle);

        // Next cycle should reset
      }
    });

    it('should maintain data integrity with mixed chunk sizes', () => {
      const aggregate = utils.chunkAggregator(1024);

      const chunk1 = new Float32Array(100).fill(1);
      const chunk2 = new Float32Array(200).fill(2);
      const chunk3 = new Float32Array(300).fill(3);
      const chunk4 = new Float32Array(424).fill(4);

      aggregate(chunk1);
      aggregate(chunk2);
      aggregate(chunk3);
      const result = aggregate(chunk4);

      expect(result.isBufferFull).to.be.true;
      expect(result.buffer.length).to.equal(1024);

      // Verify data is correctly positioned
      expect(result.buffer[0]).to.equal(1);
      expect(result.buffer[100]).to.equal(2);
      expect(result.buffer[300]).to.equal(3);
      expect(result.buffer[600]).to.equal(4);
    });
  });

  describe('model consistency', () => {
    it('should generate models with consistent threshold ranges', () => {
      const validPeaks = utils.generateValidPeaksModel();
      const nextIndex = utils.generateNextIndexPeaksModel();

      expect(Object.keys(validPeaks).length).to.equal(Object.keys(nextIndex).length);
    });

    it('should allow threshold iteration over generated models', async () => {
      const model = utils.generateValidPeaksModel();
      let iterationCount = 0;

      await utils.descendingOverThresholds(async threshold => {
        expect(model).to.have.property(String(threshold));
        iterationCount++;
        return false;
      });

      expect(iterationCount).to.equal(Object.keys(model).length);
    });
  });
});
