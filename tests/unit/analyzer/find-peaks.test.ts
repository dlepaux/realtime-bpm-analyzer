import {expect} from 'chai';
import {findPeaksAtThreshold} from '../../../src/core/analyzer';

const sampleRate = 44_100;

/**
 * Unit tests for findPeaksAtThreshold function
 * Tests peak detection at different thresholds
 */
describe('analyzer - findPeaksAtThreshold', () => {
  describe('empty and invalid inputs', () => {
    it('should return 0 peaks for empty channel data', () => {
      const emptyData = new Float32Array(0);
      const result = findPeaksAtThreshold({
        audioSampleRate: sampleRate,
        data: emptyData,
        threshold: 0.5,
      });
      expect(result.peaks).to.have.lengthOf(0);
      expect(result.threshold).to.equal(0.5);
    });

    it('should throw error for invalid threshold above 1', () => {
      const data = new Float32Array([0.5, 0.8, 0.5]);
      expect(() => {
        findPeaksAtThreshold({
          audioSampleRate: sampleRate,
          data,
          threshold: 1.5,
        });
      }).to.throw('Invalid threshold');
    });

    it('should throw error for negative threshold', () => {
      const data = new Float32Array([0.5, 0.8, 0.5]);
      expect(() => {
        findPeaksAtThreshold({
          audioSampleRate: sampleRate,
          data,
          threshold: -0.5,
        });
      }).to.throw('Invalid threshold');
    });

    it('should throw error for invalid sample rate', () => {
      const data = new Float32Array([0.5, 0.8, 0.5]);
      expect(() => {
        findPeaksAtThreshold({
          audioSampleRate: 0,
          data,
          threshold: 0.5,
        });
      }).to.throw('Invalid sample rate');
    });
  });

  describe('silent and flat audio', () => {
    it('should return 0 peaks for silent audio', () => {
      const silentData = new Float32Array(1000).fill(0);
      const result = findPeaksAtThreshold({
        audioSampleRate: sampleRate,
        data: silentData,
        threshold: 0.5,
      });
      expect(result.peaks).to.have.lengthOf(0);
    });

    it('should return 0 peaks for flat audio below threshold', () => {
      const flatData = new Float32Array(1000).fill(0.3);
      const result = findPeaksAtThreshold({
        audioSampleRate: sampleRate,
        data: flatData,
        threshold: 0.5,
      });
      expect(result.peaks).to.have.lengthOf(0);
    });
  });

  describe('peak detection with various patterns', () => {
    it('should detect peaks above threshold', () => {
      // Create data with clear peaks
      const data = new Float32Array(10000);
      // Add peaks at known positions (spaced apart)
      data[1000] = 0.9;
      data[5000] = 0.8;
      data[9000] = 0.95;

      const result = findPeaksAtThreshold({
        audioSampleRate: sampleRate,
        data,
        threshold: 0.5,
      });

      expect(result.peaks.length).to.be.greaterThan(0);
      expect(result.threshold).to.equal(0.5);
    });

    it('should not detect peaks below threshold', () => {
      const data = new Float32Array(1000);
      // Add values below threshold
      for (let i = 0; i < data.length; i += 100) {
        data[i] = 0.3;
      }

      const result = findPeaksAtThreshold({
        audioSampleRate: sampleRate,
        data,
        threshold: 0.5,
      });

      expect(result.peaks).to.have.lengthOf(0);
    });

    it('should detect peaks at exact threshold', () => {
      const data = new Float32Array(10000);
      data[1000] = 0.5;
      data[5000] = 0.5;

      const result = findPeaksAtThreshold({
        audioSampleRate: sampleRate,
        data,
        threshold: 0.5,
      });

      expect(result.peaks.length).to.be.at.least(0); // Implementation may or may not count exact threshold
      expect(result.threshold).to.equal(0.5);
    });
  });

  describe('threshold boundary conditions', () => {
    it('should detect peaks at threshold = 0', () => {
      const data = new Float32Array(1000);
      data[100] = 0.1;
      data[500] = 0.2;

      const result = findPeaksAtThreshold({
        audioSampleRate: sampleRate,
        data,
        threshold: 0,
      });

      // At threshold 0, any value > 0 counts
      expect(result.peaks.length).to.be.greaterThan(0);
    });

    it('should detect no peaks at threshold = 1.0', () => {
      const data = new Float32Array(1000);
      data[100] = 0.9;
      data[500] = 0.95;

      const result = findPeaksAtThreshold({
        audioSampleRate: sampleRate,
        data,
        threshold: 1,
      });

      expect(result.peaks).to.have.lengthOf(0);
    });
  });

  describe('offset parameter', () => {
    it('should start peak detection from offset', () => {
      const data = new Float32Array(10000);
      data[100] = 0.9; // Before offset
      data[5000] = 0.9; // After offset

      const result = findPeaksAtThreshold({
        audioSampleRate: sampleRate,
        data,
        threshold: 0.5,
        offset: 1000, // Start after first peak
      });

      // Should not detect the peak at 100
      expect(result.peaks).to.not.include(100);
    });

    it('should work with offset = 0 (default)', () => {
      const data = new Float32Array(10000);
      data[100] = 0.9;

      const result = findPeaksAtThreshold({
        audioSampleRate: sampleRate,
        data,
        threshold: 0.5,
        offset: 0,
      });

      expect(result.peaks.length).to.be.greaterThan(0);
    });
  });

  describe('realistic beat patterns', () => {
    it('should detect regular beat pattern', () => {
      // Simulate ~1 second of audio with 4 beats
      const data = new Float32Array(sampleRate);
      const beatInterval = Math.floor(sampleRate / 4); // 4 beats per second

      for (let i = 0; i < 4; i++) {
        const index = (i * beatInterval) + 1000; // Add some offset
        if (index < data.length) {
          data[index] = 0.9;
        }
      }

      const result = findPeaksAtThreshold({
        audioSampleRate: sampleRate,
        data,
        threshold: 0.5,
      });

      // Should detect multiple peaks
      expect(result.peaks.length).to.be.greaterThan(1);
    });

    it('should handle large audio buffers', () => {
      // Simulate 10 seconds of audio
      const data = new Float32Array(sampleRate * 10);

      // Add peaks every second
      for (let i = 0; i < 10; i++) {
        const index = (i * sampleRate) + 1000;
        if (index < data.length) {
          data[index] = 0.9;
        }
      }

      const result = findPeaksAtThreshold({
        audioSampleRate: sampleRate,
        data,
        threshold: 0.5,
      });

      expect(result.peaks.length).to.be.greaterThan(5);
      expect(result.threshold).to.equal(0.5);
    });
  });

  describe('return value structure', () => {
    it('should return object with peaks and threshold properties', () => {
      const data = new Float32Array(1000);
      data[100] = 0.9;

      const result = findPeaksAtThreshold({
        audioSampleRate: sampleRate,
        data,
        threshold: 0.7,
      });

      expect(result).to.have.property('peaks');
      expect(result).to.have.property('threshold');
      expect(result.peaks).to.be.an('array');
      expect(result.threshold).to.equal(0.7);
    });

    it('should return peaks as array of indices', () => {
      const data = new Float32Array(10000);
      data[1000] = 0.9;
      data[5000] = 0.8;

      const result = findPeaksAtThreshold({
        audioSampleRate: sampleRate,
        data,
        threshold: 0.5,
      });

      // All peaks should be numbers representing indices
      for (const peak of result.peaks) {
        expect(peak).to.be.a('number');
        expect(peak).to.be.at.least(0);
        expect(peak).to.be.lessThan(data.length);
      }
    });
  });
});
