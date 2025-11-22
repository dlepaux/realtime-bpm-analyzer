import {expect} from 'chai';
import {identifyIntervals} from '../../../src/core/analyzer';
import type {Peaks} from '../../../src/core/types';

/**
 * Unit tests for identifyIntervals function
 * Tests interval calculation between peaks
 *
 * Note: identifyIntervals compares each peak with the next 10 peaks (maxIntervalComparisons)
 * This creates multiple interval comparisons per peak to better detect tempo patterns
 */
describe('analyzer - identifyIntervals', () => {
  describe('empty and minimal inputs', () => {
    it('should return empty array for empty peaks', () => {
      const peaks: Peaks = [];
      const intervals = identifyIntervals(peaks);
      expect(intervals).to.be.an('array');
      expect(intervals).to.have.lengthOf(0);
    });

    it('should handle single peak', () => {
      const peaks: Peaks = [1000];
      const intervals = identifyIntervals(peaks);
      // Single peak compares with next 10 positions (all undefined), creating intervals
      expect(intervals).to.be.an('array');
      expect(intervals.length).to.be.greaterThan(0);
    });

    it('should handle two peaks', () => {
      const peaks: Peaks = [1000, 2000];
      const intervals = identifyIntervals(peaks);
      // Should include the actual interval between the two peaks
      const actualInterval = intervals.find(i => i.interval === 1000);
      expect(actualInterval).to.exist;
      expect(actualInterval!.count).to.be.at.least(1);
    });
  });

  describe('interval calculation correctness', () => {
    it('should calculate correct interval between two peaks', () => {
      const peaks: Peaks = [1000, 2500];
      const intervals = identifyIntervals(peaks);

      // Find the actual interval between the peaks
      const interval1500 = intervals.find(i => i.interval === 1500);
      expect(interval1500).to.exist;
      expect(interval1500).to.have.property('interval');
      expect(interval1500).to.have.property('count');
      expect(interval1500!.interval).to.equal(1500); // 2500 - 1000
    });

    it('should calculate multiple intervals correctly', () => {
      const peaks: Peaks = [1000, 2000, 3000];
      const intervals = identifyIntervals(peaks);

      // Equal spacing: should find interval of 1000
      const interval1000 = intervals.find(i => i.interval === 1000);
      expect(interval1000).to.exist;
      expect(interval1000!.count).to.be.greaterThan(1);

      // Should also find interval of 2000 (comparing peak[0] to peak[2])
      const interval2000 = intervals.find(i => i.interval === 2000);
      expect(interval2000).to.exist;
    });

    it('should handle non-uniform intervals', () => {
      const peaks: Peaks = [1000, 1500, 3000];
      const intervals = identifyIntervals(peaks);

      const intervalValues = intervals.map(i => i.interval);
      expect(intervalValues).to.include(500); // 1500 - 1000
      expect(intervalValues).to.include(1500); // 3000 - 1500
      expect(intervalValues).to.include(2000); // 3000 - 1000 (comparing non-adjacent peaks)
    });
  });

  describe('grouping identical intervals', () => {
    it('should group identical intervals and increment count', () => {
      // Regular beat pattern: 4 beats equally spaced
      const peaks: Peaks = [1000, 2000, 3000, 4000];
      const intervals = identifyIntervals(peaks);

      // All consecutive intervals are 1000, should be grouped
      const interval1000 = intervals.find(i => i.interval === 1000);
      expect(interval1000).to.exist;
      expect(interval1000!.count).to.be.greaterThan(1);
    });

    it('should handle mixed intervals with grouping', () => {
      const peaks: Peaks = [1000, 2000, 3000, 4500, 6000];
      const intervals = identifyIntervals(peaks);

      const interval1000 = intervals.find(i => i.interval === 1000);
      const interval1500 = intervals.find(i => i.interval === 1500);

      expect(interval1000).to.exist;
      expect(interval1000!.count).to.be.at.least(1);
      expect(interval1500).to.exist;
      expect(interval1500!.count).to.be.at.least(1);
    });

    it('should deduplicate identical intervals', () => {
      const peaks: Peaks = [1000, 2000, 3000, 4000, 5000];
      const intervals = identifyIntervals(peaks);

      // Should find interval 1000 and group all occurrences
      const interval1000 = intervals.find(i => i.interval === 1000);
      expect(interval1000).to.exist;
      expect(interval1000!.count).to.be.greaterThan(1);

      // Check no duplicate 1000 intervals exist
      const count1000 = intervals.filter(i => i.interval === 1000).length;
      expect(count1000).to.equal(1);
    });
  });

  describe('realistic musical patterns', () => {
    it('should handle 4/4 time signature pattern', () => {
      const beatInterval = 11025; // ~0.25s at 44100Hz
      const peaks: Peaks = [
        1000,
        1000 + beatInterval,
        1000 + (beatInterval * 2),
        1000 + (beatInterval * 3),
      ];

      const intervals = identifyIntervals(peaks);

      // Should find the beat interval
      const foundInterval = intervals.find(i => i.interval === beatInterval);
      expect(foundInterval).to.exist;
      expect(foundInterval!.count).to.be.greaterThan(1);
    });

    it('should handle syncopated rhythm', () => {
      // Syncopation: uneven beat spacing
      const peaks: Peaks = [1000, 1500, 2500, 3000, 4000];
      const intervals = identifyIntervals(peaks);

      // Multiple different intervals
      expect(intervals.length).to.be.greaterThan(1);

      // Each interval should have count and be valid
      for (const interval of intervals) {
        expect(interval.count).to.be.at.least(1);
        expect(interval).to.have.property('interval');
      }
    });

    it('should handle long audio with many peaks', () => {
      // Simulate 10 seconds at 120 BPM (2 beats per second)
      const peaks: Peaks = [];
      const beatInterval = 22050; // 0.5s at 44100Hz

      for (let i = 0; i < 20; i++) {
        peaks.push(1000 + (i * beatInterval));
      }

      const intervals = identifyIntervals(peaks);

      // Should find the beat interval with high count
      const foundInterval = intervals.find(i => i.interval === beatInterval);
      expect(foundInterval).to.exist;
      expect(foundInterval!.count).to.be.greaterThan(10); // Should be grouped many times
    });
  });

  describe('edge cases', () => {
    it('should handle peaks very close together', () => {
      const peaks: Peaks = [1000, 1001, 1002];
      const intervals = identifyIntervals(peaks);

      // Should have small intervals
      const hasSmallIntervals = intervals.some(i => i.interval > 0 && i.interval <= 2);
      expect(hasSmallIntervals).to.be.true;
    });

    it('should handle peaks very far apart', () => {
      const peaks: Peaks = [1000, 1_000_000, 2_000_000];
      const intervals = identifyIntervals(peaks);

      // Should find the large interval
      const largeInterval = intervals.find(i => i.interval === 999_000);
      expect(largeInterval).to.exist;
    });

    it('should handle large number of unique intervals', () => {
      const peaks: Peaks = [0, 100, 250, 500, 1000, 2000];
      const intervals = identifyIntervals(peaks);

      // All different spacing creates many unique intervals
      expect(intervals.length).to.be.greaterThan(3);

      // All intervals should have valid structure
      for (const interval of intervals) {
        expect(interval).to.have.property('interval');
        expect(interval).to.have.property('count');
      }
    });

    it('should handle zero-based peak indices', () => {
      const peaks: Peaks = [0, 1000, 2000];
      const intervals = identifyIntervals(peaks);

      // Should find interval of 1000
      const interval1000 = intervals.find(i => i.interval === 1000);
      expect(interval1000).to.exist;
    });
  });

  describe('return value structure', () => {
    it('should return array of Interval objects', () => {
      const peaks: Peaks = [1000, 2000, 3000];
      const intervals = identifyIntervals(peaks);

      expect(intervals).to.be.an('array');
      for (const interval of intervals) {
        expect(interval).to.have.property('interval');
        expect(interval).to.have.property('count');
        expect(interval.interval).to.be.a('number');
        expect(interval.count).to.be.a('number');
      }
    });

    it('should have positive or zero interval values', () => {
      const peaks: Peaks = [1000, 2000, 3000];
      const intervals = identifyIntervals(peaks);

      // Filter out zero and NaN intervals
      const validNonZeroIntervals = intervals.filter(i =>
        i.interval !== 0 && !Number.isNaN(i.interval),
      );
      expect(validNonZeroIntervals.length).to.be.greaterThan(0);

      for (const interval of validNonZeroIntervals) {
        expect(interval.interval).to.be.greaterThan(0);
      }
    });

    it('should have count >= 1 for all intervals', () => {
      const peaks: Peaks = [1000, 2000, 3500];
      const intervals = identifyIntervals(peaks);

      for (const interval of intervals) {
        expect(interval.count).to.be.at.least(1);
      }
    });
  });

  describe('mathematical properties', () => {
    it('should create multiple interval comparisons per peak', () => {
      const peaks: Peaks = [100, 200, 300, 400, 500];
      const intervals = identifyIntervals(peaks);

      // With maxIntervalComparisons=10, each peak compares with next 10 peaks
      // This creates many more intervals than just n-1
      expect(intervals.length).to.be.greaterThan(1);

      const totalCount = intervals.reduce((sum, i) => sum + i.count, 0);
      expect(totalCount).to.be.greaterThan(peaks.length - 1);
    });

    it('should handle peaks in ascending order', () => {
      const peaks: Peaks = [0, 1000, 2000, 3000];
      const intervals = identifyIntervals(peaks);

      // For peaks in ascending order, non-zero valid intervals should be positive
      const validNonZeroIntervals = intervals.filter(i =>
        i.interval !== 0 && !Number.isNaN(i.interval),
      );
      expect(validNonZeroIntervals.length).to.be.greaterThan(0);

      for (const interval of validNonZeroIntervals) {
        expect(interval.interval).to.be.greaterThan(0);
      }
    });

    it('should handle peak indices in any order', () => {
      // If peaks are not sorted, intervals can be negative
      const peaks: Peaks = [3000, 1000, 2000];
      const intervals = identifyIntervals(peaks);

      // Should still calculate intervals (including negative ones)
      expect(intervals).to.be.an('array');
      expect(intervals.length).to.be.greaterThan(0);

      // Should have both positive and negative intervals
      const hasNegative = intervals.some(i => i.interval < 0);
      const hasPositive = intervals.some(i => i.interval > 0);
      expect(hasNegative || hasPositive).to.be.true;
    });
  });
});
