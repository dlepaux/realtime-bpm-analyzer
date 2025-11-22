import {expect} from 'chai';
import {RealTimeBpmAnalyzer} from '../../../src/core/realtime-bpm-analyzer';
import * as utils from '../../../src/core/utils';

/**
 * Helper function to find the actual key in validPeaks/nextIndexPeaks that represents a given threshold
 * This handles floating-point precision issues by comparing normalized values
 */
function getThresholdKey(analyzer: RealTimeBpmAnalyzer, threshold: number): string {
  const target = threshold.toFixed(2);
  const key = Object.keys(analyzer.validPeaks).find(k =>
    Number.parseFloat(k).toFixed(2) === target,
  );
  if (!key) {
    throw new Error(`No threshold key found for ${threshold} (looking for ${target})`);
  }

  return key;
}

/**
 * Unit tests for RealTimeBpmAnalyzer.clearValidPeaks method
 * Tests threshold-based peak cleanup for memory optimization
 */
describe('RealTimeBpmAnalyzer - clearValidPeaks', () => {
  describe('threshold cleanup', () => {
    it('should remove peaks below specified threshold', async () => {
      const analyzer = new RealTimeBpmAnalyzer();

      const key090 = getThresholdKey(analyzer, 0.9);
      const key085 = getThresholdKey(analyzer, 0.85);
      const key080 = getThresholdKey(analyzer, 0.8);
      const key075 = getThresholdKey(analyzer, 0.75);
      const key070 = getThresholdKey(analyzer, 0.7);

      // Populate validPeaks with test data
      analyzer.validPeaks[key090] = [100, 200, 300];
      analyzer.validPeaks[key085] = [150, 250, 350];
      analyzer.validPeaks[key080] = [180, 280, 380];
      analyzer.validPeaks[key075] = [120, 220, 320];
      analyzer.validPeaks[key070] = [110, 210, 310];

      // Clear peaks below 0.8
      await analyzer.clearValidPeaks(0.8);

      // Above threshold should remain
      expect(analyzer.validPeaks[key090]).to.deep.equal([100, 200, 300]);
      expect(analyzer.validPeaks[key085]).to.deep.equal([150, 250, 350]);

      // Below threshold should be deleted
      expect(analyzer.validPeaks[key080]).to.be.undefined;
      expect(analyzer.validPeaks[key075]).to.be.undefined;
      expect(analyzer.validPeaks[key070]).to.be.undefined;
    });

    it('should remove nextIndexPeaks below threshold', async () => {
      const analyzer = new RealTimeBpmAnalyzer();

      const key090 = getThresholdKey(analyzer, 0.9);
      const key085 = getThresholdKey(analyzer, 0.85);
      const key075 = getThresholdKey(analyzer, 0.75);

      // Populate both validPeaks and nextIndexPeaks
      analyzer.validPeaks[key090] = [100];
      analyzer.nextIndexPeaks[key090] = 1000;
      analyzer.validPeaks[key085] = [150];
      analyzer.nextIndexPeaks[key085] = 1500;
      analyzer.validPeaks[key075] = [120];
      analyzer.nextIndexPeaks[key075] = 1200;

      await analyzer.clearValidPeaks(0.8);

      // Above threshold should remain
      expect(analyzer.nextIndexPeaks[key090]).to.equal(1000);
      expect(analyzer.nextIndexPeaks[key085]).to.equal(1500);

      // Below threshold should be deleted
      expect(analyzer.nextIndexPeaks[key075]).to.be.undefined;
    });

    it('should update minValidThreshold', async () => {
      const analyzer = new RealTimeBpmAnalyzer();
      expect(analyzer.minValidThreshold).to.equal(0.2);

      await analyzer.clearValidPeaks(0.75);

      expect(analyzer.minValidThreshold).to.equal(0.75);
    });

    it('should handle threshold at exact boundary', async () => {
      const analyzer = new RealTimeBpmAnalyzer();

      const key085 = getThresholdKey(analyzer, 0.85);
      const key080 = getThresholdKey(analyzer, 0.8);
      const key075 = getThresholdKey(analyzer, 0.75);

      analyzer.validPeaks[key085] = [100, 200];
      analyzer.validPeaks[key080] = [150, 250];
      analyzer.validPeaks[key075] = [180, 280];

      // Clear at exactly 0.80
      await analyzer.clearValidPeaks(0.8);

      // Above threshold should remain
      expect(analyzer.validPeaks[key085]).to.exist.and.deep.equal([100, 200]);

      // At or below threshold should be deleted
      expect(analyzer.validPeaks[key080]).to.be.undefined;
      expect(analyzer.validPeaks[key075]).to.be.undefined;
    });
  });

  describe('edge cases', () => {
    it('should handle empty validPeaks', async () => {
      const analyzer = new RealTimeBpmAnalyzer();

      // No peaks populated
      await analyzer.clearValidPeaks(0.8);

      // Should not throw, minValidThreshold should update
      expect(analyzer.minValidThreshold).to.equal(0.8);
    });

    it('should handle clearing all peaks', async () => {
      const analyzer = new RealTimeBpmAnalyzer();

      const key050 = getThresholdKey(analyzer, 0.5);
      const key045 = getThresholdKey(analyzer, 0.45);
      const key040 = getThresholdKey(analyzer, 0.4);

      analyzer.validPeaks[key050] = [100];
      analyzer.validPeaks[key045] = [150];
      analyzer.validPeaks[key040] = [200];

      // Clear everything by setting high threshold
      await analyzer.clearValidPeaks(0.95);

      expect(analyzer.validPeaks[key050]).to.be.undefined;
      expect(analyzer.validPeaks[key045]).to.be.undefined;
      expect(analyzer.validPeaks[key040]).to.be.undefined;
      expect(analyzer.minValidThreshold).to.equal(0.95);
    });

    it('should handle clearing no peaks (very low threshold)', async () => {
      const analyzer = new RealTimeBpmAnalyzer();

      const key085 = getThresholdKey(analyzer, 0.85);
      const key080 = getThresholdKey(analyzer, 0.8);
      const key075 = getThresholdKey(analyzer, 0.75);

      analyzer.validPeaks[key085] = [100];
      analyzer.validPeaks[key080] = [150];
      analyzer.validPeaks[key075] = [200];

      // Clear nothing by setting threshold below all
      await analyzer.clearValidPeaks(0.2);

      // All should remain
      expect(analyzer.validPeaks[key085]).to.deep.equal([100]);
      expect(analyzer.validPeaks[key080]).to.deep.equal([150]);
      expect(analyzer.validPeaks[key075]).to.deep.equal([200]);
      expect(analyzer.minValidThreshold).to.equal(0.2);
    });

    it('should handle threshold with many decimal places', async () => {
      const analyzer = new RealTimeBpmAnalyzer();

      const key085 = getThresholdKey(analyzer, 0.85);
      const key080 = getThresholdKey(analyzer, 0.8);
      const key075 = getThresholdKey(analyzer, 0.75);

      analyzer.validPeaks[key085] = [100];
      analyzer.validPeaks[key080] = [150];
      analyzer.validPeaks[key075] = [200];

      // Use threshold with precise decimal
      await analyzer.clearValidPeaks(0.7999999);

      // Should be treated as approximately 0.80 and clear below
      expect(analyzer.validPeaks[key085]).to.exist;
      expect(analyzer.validPeaks[key080]).to.exist;
      expect(analyzer.validPeaks[key075]).to.be.undefined;
    });

    it('should handle multiple calls with increasing thresholds', async () => {
      const analyzer = new RealTimeBpmAnalyzer();

      const key090 = getThresholdKey(analyzer, 0.9);
      const key085 = getThresholdKey(analyzer, 0.85);
      const key080 = getThresholdKey(analyzer, 0.8);
      const key075 = getThresholdKey(analyzer, 0.75);
      const key070 = getThresholdKey(analyzer, 0.7);

      analyzer.validPeaks[key090] = [100];
      analyzer.validPeaks[key085] = [150];
      analyzer.validPeaks[key080] = [200];
      analyzer.validPeaks[key075] = [250];
      analyzer.validPeaks[key070] = [300];

      // Progressive cleanup
      await analyzer.clearValidPeaks(0.75);
      expect(analyzer.validPeaks[key070]).to.be.undefined;
      expect(analyzer.validPeaks[key075]).to.be.undefined;
      expect(analyzer.validPeaks[key080]).to.exist.and.deep.equal([200]);
      expect(analyzer.validPeaks[key085]).to.exist.and.deep.equal([150]);

      await analyzer.clearValidPeaks(0.82);
      expect(analyzer.validPeaks[key085]).to.exist.and.deep.equal([150]);
      expect(analyzer.validPeaks[key080]).to.be.undefined;

      await analyzer.clearValidPeaks(0.88);
      expect(analyzer.validPeaks[key090]).to.exist.and.deep.equal([100]);
      expect(analyzer.validPeaks[key085]).to.be.undefined;
    });
  });

  describe('memory optimization', () => {
    it('should free memory by removing entries', async () => {
      const analyzer = new RealTimeBpmAnalyzer();

      // Populate with large arrays using the actual threshold keys
      for (let threshold = 90; threshold >= 20; threshold -= 5) {
        const thresholdValue = threshold / 100;
        const key = getThresholdKey(analyzer, thresholdValue);
        analyzer.validPeaks[key] = Array.from({length: 1000}, (_, i) => i);
        analyzer.nextIndexPeaks[key] = threshold * 1000;
      }

      const keysBeforeCleanup = Object.keys(analyzer.validPeaks).length;
      expect(keysBeforeCleanup).to.be.greaterThan(10);

      // Clear peaks below 0.70
      await analyzer.clearValidPeaks(0.7);

      const keysAfterCleanup = Object.keys(analyzer.validPeaks).length;
      expect(keysAfterCleanup).to.be.lessThan(keysBeforeCleanup);

      // Verify specific cleanup - keys at 0.70 and below should be deleted
      const key075 = getThresholdKey(analyzer, 0.75);
      const key080 = getThresholdKey(analyzer, 0.8);
      const key085 = getThresholdKey(analyzer, 0.85);

      // Keys below threshold should be cleared (can't check them as they're deleted)
      // But we can verify the count decreased
      expect(keysAfterCleanup).to.be.approximately(keysBeforeCleanup - 11, 1); // ~11 keys below 0.70

      // Keys at or above 0.75 should still exist with data
      expect(analyzer.validPeaks[key075]).to.exist.and.be.an('array');
      expect(analyzer.validPeaks[key080]).to.exist.and.be.an('array');
      expect(analyzer.validPeaks[key085]).to.exist.and.be.an('array');
    });

    it('should handle large peak arrays', async () => {
      const analyzer = new RealTimeBpmAnalyzer();

      const key050 = getThresholdKey(analyzer, 0.5);
      const key085 = getThresholdKey(analyzer, 0.85);

      // Create very large peak array
      analyzer.validPeaks[key050] = Array.from({length: 10000}, (_, i) => i * 100);
      analyzer.validPeaks[key085] = Array.from({length: 10000}, (_, i) => i * 100);

      await analyzer.clearValidPeaks(0.8);

      expect(analyzer.validPeaks[key050]).to.be.undefined;
      expect(analyzer.validPeaks[key085]).to.exist;
      expect(analyzer.validPeaks[key085].length).to.equal(10000);
    });
  });

  describe('floating-point precision', () => {
    it('should handle floating-point comparison correctly', async () => {
      const analyzer = new RealTimeBpmAnalyzer();

      const key085 = getThresholdKey(analyzer, 0.85);
      const key080 = getThresholdKey(analyzer, 0.8);
      const key075 = getThresholdKey(analyzer, 0.75);

      analyzer.validPeaks[key085] = [100];
      analyzer.validPeaks[key080] = [150];
      analyzer.validPeaks[key075] = [200];

      // Test with value that might have precision issues
      await analyzer.clearValidPeaks(0.8);

      expect(analyzer.validPeaks[key085]).to.exist.and.deep.equal([100]);
      expect(analyzer.validPeaks[key080]).to.be.undefined;
      expect(analyzer.validPeaks[key075]).to.be.undefined;
    });

    it('should handle threshold normalization', async () => {
      const analyzer = new RealTimeBpmAnalyzer();

      const key085 = getThresholdKey(analyzer, 0.85);
      const key075 = getThresholdKey(analyzer, 0.75);

      analyzer.validPeaks[key085] = [100];
      analyzer.validPeaks[key075] = [200];

      // Clear with high precision number
      await analyzer.clearValidPeaks(0.799999999);

      // Should be treated as approximately 0.80
      expect(Number.parseFloat(analyzer.minValidThreshold.toFixed(2))).to.equal(0.8);
      expect(analyzer.validPeaks[key075]).to.be.undefined;
      expect(analyzer.validPeaks[key085]).to.exist;
    });
  });

  describe('integration with threshold model', () => {
    it('should work with standard threshold model', async () => {
      const analyzer = new RealTimeBpmAnalyzer();

      const key085 = getThresholdKey(analyzer, 0.85);
      const key075 = getThresholdKey(analyzer, 0.75);
      const key070 = getThresholdKey(analyzer, 0.7);

      // Populate with test data
      analyzer.validPeaks[key085] = [100, 200];
      analyzer.validPeaks[key075] = [];
      analyzer.validPeaks[key070] = [150, 250];

      await analyzer.clearValidPeaks(0.75);

      expect(analyzer.validPeaks[key085]).to.deep.equal([100, 200]);
      expect(analyzer.validPeaks[key075]).to.be.undefined;
      expect(analyzer.validPeaks[key070]).to.be.undefined;
    });
  });
});
