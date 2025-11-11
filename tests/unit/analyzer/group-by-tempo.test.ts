import {expect} from 'chai';
import {groupByTempo} from '../../../src/core/analyzer';
import type {Interval} from '../../../src/core/types';

/**
 * Unit tests for groupByTempo function
 * Tests tempo normalization and grouping logic (90-180 BPM range)
 */
describe('analyzer - groupByTempo', () => {
  const sampleRate = 44100;

  describe('tempo normalization to 90-180 BPM range', () => {
    it('should double tempo below 90 BPM', () => {
      // 60 BPM: 1 beat per second = 44100 samples per beat
      const intervals: Interval[] = [
        {interval: 44100, count: 10}, // 60 BPM
      ];

      const result = groupByTempo({audioSampleRate: sampleRate, intervalCounts: intervals});

      // Should double to 120 BPM
      expect(result.length).to.be.greaterThan(0);
      const tempo = result[0].tempo;
      expect(tempo).to.be.greaterThanOrEqual(90);
      expect(tempo).to.equal(120);
    });

    it('should halve tempo above 180 BPM', () => {
      // 240 BPM: 4 beats per second = 11025 samples per beat
      const intervals: Interval[] = [
        {interval: 11025, count: 10}, // 240 BPM
      ];

      const result = groupByTempo({audioSampleRate: sampleRate, intervalCounts: intervals});

      // Should halve to 120 BPM
      expect(result.length).to.be.greaterThan(0);
      const tempo = result[0].tempo;
      expect(tempo).to.be.lessThanOrEqual(180);
      expect(tempo).to.equal(120);
    });

    it('should keep tempo within 90-180 range unchanged', () => {
      // 120 BPM: 2 beats per second = 22050 samples per beat
      const intervals: Interval[] = [
        {interval: 22050, count: 10}, // 120 BPM
      ];

      const result = groupByTempo({audioSampleRate: sampleRate, intervalCounts: intervals});

      expect(result[0].tempo).to.equal(120);
    });

    it('should handle 90 BPM boundary', () => {
      // 90 BPM: 1.5 beats per second
      const samplesPerBeat = Math.floor(sampleRate / 1.5);
      const intervals: Interval[] = [
        {interval: samplesPerBeat, count: 10},
      ];

      const result = groupByTempo({audioSampleRate: sampleRate, intervalCounts: intervals});

      expect(result[0].tempo).to.be.greaterThanOrEqual(90);
      expect(result[0].tempo).to.be.lessThanOrEqual(180);
    });

    it('should handle 180 BPM boundary', () => {
      // 180 BPM: 3 beats per second
      const samplesPerBeat = Math.floor(sampleRate / 3);
      const intervals: Interval[] = [
        {interval: samplesPerBeat, count: 10},
      ];

      const result = groupByTempo({audioSampleRate: sampleRate, intervalCounts: intervals});

      expect(result[0].tempo).to.be.greaterThanOrEqual(90);
      expect(result[0].tempo).to.be.lessThanOrEqual(180);
    });

    it('should handle very slow tempo (30 BPM → 120 BPM)', () => {
      // 30 BPM needs to be doubled twice: 30 → 60 → 120
      const samplesPerBeat = Math.floor(sampleRate / 0.5); // 0.5 beats per second
      const intervals: Interval[] = [
        {interval: samplesPerBeat, count: 10},
      ];

      const result = groupByTempo({audioSampleRate: sampleRate, intervalCounts: intervals});

      expect(result[0].tempo).to.be.greaterThanOrEqual(90);
      expect(result[0].tempo).to.equal(120);
    });

    it('should handle very fast tempo (360 BPM → 180 BPM)', () => {
      // 360 BPM needs to be halved once: 360 → 180
      const samplesPerBeat = Math.floor(sampleRate / 6); // 6 beats per second
      const intervals: Interval[] = [
        {interval: samplesPerBeat, count: 10},
      ];

      const result = groupByTempo({audioSampleRate: sampleRate, intervalCounts: intervals});

      expect(result[0].tempo).to.be.lessThanOrEqual(180);
      expect(result[0].tempo).to.equal(180);
    });
  });

  describe('tempo grouping with count accumulation', () => {
    it('should group identical tempos and sum counts', () => {
      // Two intervals that normalize to same tempo (120 BPM)
      const intervals: Interval[] = [
        {interval: 22050, count: 5}, // 120 BPM
        {interval: 22050, count: 7}, // 120 BPM
      ];

      const result = groupByTempo({audioSampleRate: sampleRate, intervalCounts: intervals});

      expect(result.length).to.equal(1);
      expect(result[0].tempo).to.equal(120);
      expect(result[0].count).to.equal(12); // 5 + 7
    });

    it('should group tempos that normalize to same value', () => {
      // 60 BPM and 120 BPM should both appear as 120 after normalization
      const intervals: Interval[] = [
        {interval: 44100, count: 3}, // 60 BPM → 120 BPM
        {interval: 22050, count: 5}, // 120 BPM → 120 BPM
      ];

      const result = groupByTempo({audioSampleRate: sampleRate, intervalCounts: intervals});

      const tempo120 = result.find(t => t.tempo === 120);
      expect(tempo120).to.exist;
      expect(tempo120!.count).to.equal(8); // 3 + 5
    });

    it('should keep separate tempos distinct', () => {
      const intervals: Interval[] = [
        {interval: 22050, count: 5}, // 120 BPM
        {interval: 18375, count: 3}, // ~144 BPM
      ];

      const result = groupByTempo({audioSampleRate: sampleRate, intervalCounts: intervals});

      expect(result.length).to.be.greaterThan(1);
      const tempos = result.map(t => t.tempo);
      expect(tempos).to.include(120);
    });

    it('should handle many intervals with same normalized tempo', () => {
      // Multiple intervals that all normalize to same tempo
      const intervals: Interval[] = [
        {interval: 44100, count: 2}, // 60 → 120
        {interval: 22050, count: 5}, // 120
        {interval: 11025, count: 3}, // 240 → 120
      ];

      const result = groupByTempo({audioSampleRate: sampleRate, intervalCounts: intervals});

      const tempo120 = result.find(t => t.tempo === 120);
      expect(tempo120).to.exist;
      expect(tempo120!.count).to.equal(10); // 2 + 5 + 3
    });
  });

  describe('edge cases', () => {
    it('should handle empty intervals', () => {
      const intervals: Interval[] = [];
      const result = groupByTempo({audioSampleRate: sampleRate, intervalCounts: intervals});

      expect(result).to.be.an('array');
      expect(result.length).to.equal(0);
    });

    it('should skip intervals with zero interval value', () => {
      const intervals: Interval[] = [
        {interval: 0, count: 10},
        {interval: 22050, count: 5},
      ];

      const result = groupByTempo({audioSampleRate: sampleRate, intervalCounts: intervals});

      // Should only include the valid interval
      expect(result.length).to.equal(1);
      expect(result[0].tempo).to.equal(120);
    });

    it('should handle negative intervals', () => {
      // Negative intervals can occur if peaks are not sorted
      const intervals: Interval[] = [
        {interval: -22050, count: 5},
        {interval: 22050, count: 3},
      ];

      const result = groupByTempo({audioSampleRate: sampleRate, intervalCounts: intervals});

      // Should use Math.abs() internally
      expect(result.length).to.be.greaterThan(0);
      const tempos = result.map(t => t.tempo);
      expect(tempos.every(t => t >= 90 && t <= 180)).to.be.true;
    });

    it('should round tempo to integer', () => {
      // 123.456 BPM should round to 123
      const samplesPerBeat = Math.floor(sampleRate / (123.456 / 60));
      const intervals: Interval[] = [
        {interval: samplesPerBeat, count: 10},
      ];

      const result = groupByTempo({audioSampleRate: sampleRate, intervalCounts: intervals});

      expect(result[0].tempo).to.be.a('number');
      expect(result[0].tempo % 1).to.equal(0); // Should be integer
    });

    it('should handle very small intervals (very fast tempo)', () => {
      // Extremely small interval (e.g., 100 samples)
      const intervals: Interval[] = [
        {interval: 100, count: 5},
      ];

      const result = groupByTempo({audioSampleRate: sampleRate, intervalCounts: intervals});

      expect(result.length).to.be.greaterThan(0);
      // Should normalize to 90-180 range
      expect(result[0].tempo).to.be.greaterThanOrEqual(90);
      expect(result[0].tempo).to.be.lessThanOrEqual(180);
    });

    it('should handle very large intervals (very slow tempo)', () => {
      // Very large interval (e.g., 2 seconds)
      const intervals: Interval[] = [
        {interval: sampleRate * 2, count: 5},
      ];

      const result = groupByTempo({audioSampleRate: sampleRate, intervalCounts: intervals});

      expect(result.length).to.be.greaterThan(0);
      // Should normalize to 90-180 range
      expect(result[0].tempo).to.be.greaterThanOrEqual(90);
      expect(result[0].tempo).to.be.lessThanOrEqual(180);
    });
  });

  describe('sample rate variations', () => {
    it('should work with different sample rates', () => {
      const sampleRates = [8000, 16000, 22050, 44100, 48000, 96000];

      for (const sr of sampleRates) {
        // 120 BPM at this sample rate
        const samplesPerBeat = Math.floor(sr / 2);
        const intervals: Interval[] = [
          {interval: samplesPerBeat, count: 10},
        ];

        const result = groupByTempo({audioSampleRate: sr, intervalCounts: intervals});

        expect(result.length).to.be.greaterThan(0);
        expect(result[0].tempo).to.be.closeTo(120, 2); // Allow small rounding error
      }
    });

    it('should produce consistent results across sample rates', () => {
      // Same physical tempo (120 BPM) at different sample rates
      const results = [];

      for (const sr of [44100, 48000]) {
        const samplesPerBeat = Math.floor(sr / 2);
        const intervals: Interval[] = [
          {interval: samplesPerBeat, count: 10},
        ];

        const result = groupByTempo({audioSampleRate: sr, intervalCounts: intervals});
        results.push(result[0].tempo);
      }

      // Both should detect same tempo
      expect(results[0]).to.equal(results[1]);
    });
  });

  describe('return value structure', () => {
    it('should return Tempo objects with correct properties', () => {
      const intervals: Interval[] = [
        {interval: 22050, count: 10},
      ];

      const result = groupByTempo({audioSampleRate: sampleRate, intervalCounts: intervals});

      expect(result).to.be.an('array');
      expect(result[0]).to.have.property('tempo');
      expect(result[0]).to.have.property('count');
      expect(result[0]).to.have.property('confidence');
      expect(result[0].tempo).to.be.a('number');
      expect(result[0].count).to.be.a('number');
      expect(result[0].confidence).to.be.a('number');
    });

    it('should set confidence to 0 by default', () => {
      const intervals: Interval[] = [
        {interval: 22050, count: 10},
      ];

      const result = groupByTempo({audioSampleRate: sampleRate, intervalCounts: intervals});

      expect(result[0].confidence).to.equal(0);
    });

    it('should preserve count values', () => {
      const intervals: Interval[] = [
        {interval: 22050, count: 42},
      ];

      const result = groupByTempo({audioSampleRate: sampleRate, intervalCounts: intervals});

      expect(result[0].count).to.equal(42);
    });
  });

  describe('complex scenarios', () => {
    it('should handle multiple tempos in different ranges', () => {
      const intervals: Interval[] = [
        {interval: 44100, count: 3}, // 60 → 120 BPM
        {interval: 29400, count: 5}, // 90 BPM
        {interval: 18375, count: 7}, // ~144 BPM
        {interval: 14700, count: 4}, // 180 BPM
      ];

      const result = groupByTempo({audioSampleRate: sampleRate, intervalCounts: intervals});

      expect(result.length).to.be.greaterThan(1);
      // All should be in valid range
      for (const tempo of result) {
        expect(tempo.tempo).to.be.greaterThanOrEqual(90);
        expect(tempo.tempo).to.be.lessThanOrEqual(180);
      }
    });

    it('should handle realistic music interval distribution', () => {
      // Simulate detected intervals from actual music
      const intervals: Interval[] = [
        {interval: 22050, count: 25}, // Main beat: 120 BPM
        {interval: 11025, count: 10}, // Double-time: 240 → 120 BPM
        {interval: 44100, count: 5}, // Half-time: 60 → 120 BPM
        {interval: 21000, count: 8}, // Slightly off-beat
      ];

      const result = groupByTempo({audioSampleRate: sampleRate, intervalCounts: intervals});

      // Should group many to 120 BPM
      const tempo120 = result.find(t => t.tempo === 120);
      expect(tempo120).to.exist;
      expect(tempo120!.count).to.be.greaterThan(20);
    });
  });
});
