import {expect} from 'chai';
import {bandCounts, errorProfile, isCorrect, isOctaveCorrect, summarize} from '../../../benchmark/lib/metrics';
import type {TrackResult} from '../../../benchmark/lib/types';

function result(overrides: Partial<TrackResult>): TrackResult {
  return {
    set: 's', id: 'a', genre: 'g', truth: 100, duration: 30, final: 100, firstReadingAt: 5, firstCorrectAt: 5, stable: [], ...overrides,
  };
}

describe('benchmark metrics', () => {
  it('sorts wrong readings by their relation to the truth', () => {
    const finals = [100, 50, 51, 200, 66, 150, 300, 137, null];

    expect(errorProfile(finals.map(final => result({final})))).to.deep.equal({
      '1/2': 2, 2: 1, '2/3': 1, '3/2': 1, 3: 1, other: 1, none: 1,
    });
  });

  it('counts ±4% as correct, inclusive', () => {
    expect(isCorrect(104, 100)).to.equal(true);
    expect(isCorrect(104.1, 100)).to.equal(false);
    expect(isCorrect(96, 100)).to.equal(true);
  });

  it('forgives doubles, halves and thirds in Acc2 only', () => {
    expect(isCorrect(200, 100)).to.equal(false);

    for (const reading of [200, 300, 50, 33.3]) {
      expect(isOctaveCorrect(reading, 100), String(reading)).to.equal(true);
    }

    expect(isOctaveCorrect(150, 100)).to.equal(false);
  });

  it('scores a track with no reading as wrong', () => {
    const summary = summarize([result({}), result({final: null, firstCorrectAt: null})]);

    expect(summary.acc1).to.equal(0.5);
    expect(summary.acc2).to.equal(0.5);
    expect(summary.everCorrect).to.equal(0.5);
  });

  it('takes the median first correct reading over all tracks, misses included', () => {
    const summary = summarize([
      result({firstCorrectAt: 4}),
      result({firstCorrectAt: 8}),
      result({firstCorrectAt: null}),
    ]);

    expect(summary.medianFirstCorrect).to.equal(8);
  });

  it('reads no median once most tracks never came right', () => {
    const summary = summarize([result({firstCorrectAt: 4}), result({firstCorrectAt: null}), result({firstCorrectAt: null})]);

    expect(summary.medianFirstCorrect).to.equal(null);
  });

  it('pools the false-stable rate and keeps a first-stable rate per track', () => {
    const summary = summarize([
      result({stable: [[5, 150], [6, 100], [7, 100], [8, 100]]}),
      result({stable: [[5, 100]]}),
      result({}),
    ]);

    expect(summary.falseStable).to.equal(0.2);
    expect(summary.falseFirstStable).to.equal(0.5);
    expect(summary.stableCoverage).to.equal(2 / 3);
    expect(summary.stableReadings).to.equal(5);
  });

  it('has no false-stable rate when nothing was ever stable', () => {
    expect(summarize([result({})]).falseStable).to.equal(null);
  });

  it('reports offline accuracy only when every track has it', () => {
    expect(summarize([result({})]).offlineAcc1).to.equal(undefined);
    expect(summarize([result({offline: 100}), result({offline: null})]).offlineAcc1).to.equal(0.5);
  });
});

describe('bandCounts', () => {
  it('sorts tracks by labelled tempo, a band holding its low edge and not its high one', () => {
    const counts = bandCounts([
      result({truth: 140, final: 140}), result({truth: 164.9, final: 82}), result({truth: 165, final: 165}), result({truth: 290, final: null}),
    ]);

    expect(counts['140-165']).to.deep.equal({tracks: 2, correct: 1});
    expect(counts['165+']).to.deep.equal({tracks: 2, correct: 1});
    expect(counts['120-140']).to.deep.equal({tracks: 0, correct: 0});
  });
});
