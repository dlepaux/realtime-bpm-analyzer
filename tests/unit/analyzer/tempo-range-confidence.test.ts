import {expect} from 'chai';
import {
  computeBpm,
  groupByTempo,
  identifyIntervals,
  resolveTempoRange,
} from '../../../src/core/tempo';
import {generateValidPeaksModel} from '../../../src/core/utils';
import type {Interval, Peaks, TempoRange, ValidPeaks} from '../../../src/core/types';

/**
 * Tempo range (octave folding) and confidence v1 (RBA-22).
 * Fixtures are synthetic peak trains generated in code: no audio involved.
 */
const sampleRate = 44100;

/**
 * Peaks of a perfect click train, in samples
 */
function clickTrain(bpm: number, beats = 40): Peaks {
  const samplesPerBeat = (60 / bpm) * sampleRate;
  return Array.from({length: beats}, (_, i) => Math.round((i + 1) * samplesPerBeat));
}

/**
 * Deterministic PRNG (mulberry32) so the "random peaks" fixture is reproducible
 */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6D_2B_79_F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Peaks with random spacing between 0.25 s (the detector's mute window) and 1 s
 */
function randomPeaks(seed: number, count = 40): Peaks {
  const random = seededRandom(seed);
  const peaks: Peaks = [];
  let position = 0;
  for (let i = 0; i < count; i++) {
    position += Math.round((0.25 + (random() * 0.75)) * sampleRate);
    peaks.push(position);
  }

  return peaks;
}

/**
 * A click train whose peaks drift by up to ±jitterMs, like a loose live drummer
 */
function jitteredClickTrain(bpm: number, jitterMs: number, seed: number): Peaks {
  const random = seededRandom(seed);
  const jitter = (jitterMs / 1000) * sampleRate;
  return clickTrain(bpm).map(peak => Math.round(peak + (((random() * 2) - 1) * jitter)));
}

/**
 * computeBpm reads the highest threshold holding more than minPeaks peaks
 */
function asValidPeaks(peaks: Peaks): ValidPeaks {
  const model = generateValidPeaksModel();
  const [firstThreshold] = Object.keys(model);
  return {...model, [firstThreshold]: peaks};
}

describe('analyzer - tempo range', () => {
  const hipHopRange: TempoRange = {min: 70, max: 140};

  it('folds an 85 BPM interval to 170 with the default range', () => {
    const intervals: Interval[] = [{interval: (60 / 85) * sampleRate, count: 10}];
    const [top] = groupByTempo({audioSampleRate: sampleRate, intervalCounts: intervals});
    expect(top.tempo).to.equal(170);
  });

  it('keeps an 85 BPM interval at 85 with a 70-140 range', () => {
    const intervals: Interval[] = [{interval: (60 / 85) * sampleRate, count: 10}];
    const [top] = groupByTempo({
      audioSampleRate: sampleRate,
      intervalCounts: intervals,
      tempoRange: hipHopRange,
    });
    expect(top.tempo).to.equal(85);
  });

  it('reads an 85 BPM click train as 170 by default and 85 with a 70-140 range', async () => {
    const data = asValidPeaks(clickTrain(85));

    const byDefault = await computeBpm({audioSampleRate: sampleRate, data});
    const withRange = await computeBpm({audioSampleRate: sampleRate, data, tempoRange: hipHopRange});

    expect(byDefault.bpm[0].tempo).to.equal(170);
    expect(withRange.bpm[0].tempo).to.equal(85);
  });

  it('keeps every candidate inside the requested range', async () => {
    const range: TempoRange = {min: 60, max: 120};
    const data = asValidPeaks(randomPeaks(7));
    const {bpm} = await computeBpm({audioSampleRate: sampleRate, data, tempoRange: range});

    expect(bpm.length).to.be.greaterThan(0);
    for (const candidate of bpm) {
      expect(candidate.tempo).to.be.within(range.min, range.max);
    }
  });

  it('gives the same tempos and counts with no range as with the explicit 90-180 default', async () => {
    for (const peaks of [clickTrain(128), clickTrain(85), randomPeaks(1), randomPeaks(2)]) {
      const data = asValidPeaks(peaks);
      const implicit = await computeBpm({audioSampleRate: sampleRate, data});
      const explicit = await computeBpm({
        audioSampleRate: sampleRate,
        data,
        tempoRange: {min: 90, max: 180},
      });
      expect(implicit).to.deep.equal(explicit);
    }
  });

  describe('resolveTempoRange', () => {
    it('defaults to 90-180', () => {
      expect(resolveTempoRange()).to.deep.equal({min: 90, max: 180});
    });

    it('returns a valid range unchanged', () => {
      expect(resolveTempoRange({min: 70, max: 140})).to.deep.equal({min: 70, max: 140});
    });

    it('rejects a range narrower than one octave, where folding cannot land inside it', () => {
      expect(() => resolveTempoRange({min: 100, max: 150})).to.throw(RangeError, /octave/);
    });

    it('rejects a non-positive or non-finite bound', () => {
      expect(() => resolveTempoRange({min: 0, max: 180})).to.throw(RangeError);
      expect(() => resolveTempoRange({min: -10, max: 180})).to.throw(RangeError);
      expect(() => resolveTempoRange({min: Number.NaN, max: 180})).to.throw(RangeError);
      expect(() => resolveTempoRange({min: 90, max: Number.POSITIVE_INFINITY})).to.throw(RangeError);
    });

    it('rejects a range that is not an object with numeric bounds', () => {
      expect(() => resolveTempoRange({min: '70', max: 140} as unknown as TempoRange)).to.throw(RangeError);
      expect(() => resolveTempoRange(null as unknown as TempoRange)).to.throw(RangeError);
    });
  });
});

describe('analyzer - confidence', () => {
  it('is the ±1 BPM support divided by all votes', () => {
    // 22050 samples = 120 BPM; 21875 ≈ 120.96 → 121; 17640 = 150 BPM
    const intervals: Interval[] = [
      {interval: 22050, count: 3},
      {interval: 21875, count: 1},
      {interval: 17640, count: 4},
    ];
    const tempos = groupByTempo({audioSampleRate: sampleRate, intervalCounts: intervals});
    const byTempo = new Map(tempos.map(t => [t.tempo, t]));

    expect(byTempo.get(120)?.confidence).to.equal(4 / 8);
    expect(byTempo.get(121)?.confidence).to.equal(4 / 8);
    expect(byTempo.get(150)?.confidence).to.equal(4 / 8);
  });

  it('is 1 when every vote lands on one tempo', () => {
    const [top] = groupByTempo({
      audioSampleRate: sampleRate,
      intervalCounts: [{interval: 22050, count: 12}],
    });
    expect(top.confidence).to.equal(1);
  });

  it('counts votes from all groups, not only the returned top 5', async () => {
    const data = asValidPeaks(randomPeaks(3));
    const intervals = identifyIntervals(data[Object.keys(data)[0]]);
    const all = groupByTempo({audioSampleRate: sampleRate, intervalCounts: intervals});
    const totalVotes = all.reduce((sum, t) => sum + t.count, 0);
    const {bpm} = await computeBpm({audioSampleRate: sampleRate, data});

    expect(all.length).to.be.greaterThan(5);
    const [top] = bpm;
    const support = all
      .filter(t => Math.abs(t.tempo - top.tempo) <= 1)
      .reduce((sum, t) => sum + t.count, 0);
    expect(top.confidence).to.equal(support / totalVotes);
  });

  it('stays within [0, 1] and does not change the ranking by count', async () => {
    const {bpm} = await computeBpm({audioSampleRate: sampleRate, data: asValidPeaks(randomPeaks(4))});
    for (const candidate of bpm) {
      expect(candidate.confidence).to.be.within(0, 1);
    }

    for (let i = 1; i < bpm.length; i++) {
      expect(bpm[i - 1].count).to.be.greaterThanOrEqual(bpm[i].count);
    }
  });

  /**
   * Calibration on synthetic fixtures. A perfect click train cannot reach 1:
   * pairs 3, 5, 6, 7 and 9 beats apart fold to other tempos. The measured
   * values are recorded in the RBA-22 PR; no docs threshold is derived here.
   */
  it('scores a perfect click train high and random peaks low', async () => {
    const clickScores: number[] = [];
    for (const bpm of [85, 100, 120, 128, 140, 174]) {
      const result = await computeBpm({audioSampleRate: sampleRate, data: asValidPeaks(clickTrain(bpm))});
      clickScores.push(result.bpm[0].confidence);
    }

    const randomScores: number[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      const result = await computeBpm({audioSampleRate: sampleRate, data: asValidPeaks(randomPeaks(seed))});
      randomScores.push(result.bpm[0].confidence);
    }

    const jitteredScores = new Map<number, number[]>();
    for (const jitterMs of [5, 10, 20]) {
      const scores: number[] = [];
      for (let seed = 1; seed <= 10; seed++) {
        const result = await computeBpm({
          audioSampleRate: sampleRate,
          data: asValidPeaks(jitteredClickTrain(120, jitterMs, seed)),
        });
        scores.push(result.bpm[0].confidence);
      }

      jitteredScores.set(jitterMs, scores);
    }

    const format = (scores: number[]) => scores.map(s => s.toFixed(3)).join(', ');
    console.log(`[RBA-22 calibration] click: ${format(clickScores)}`);
    console.log(`[RBA-22 calibration] random: ${format(randomScores)}`);
    for (const [jitterMs, scores] of jitteredScores) {
      console.log(`[RBA-22 calibration] click 120 BPM ±${jitterMs} ms: ${format(scores)}`);
    }

    expect(Math.min(...clickScores)).to.be.greaterThan(0.4);
    expect(Math.max(...randomScores)).to.be.lessThan(0.15);
    expect(Math.min(...(jitteredScores.get(5) ?? []))).to.be.greaterThan(Math.max(...randomScores));
  });
});
