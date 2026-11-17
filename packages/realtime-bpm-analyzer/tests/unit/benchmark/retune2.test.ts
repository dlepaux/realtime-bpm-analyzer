import {expect} from 'chai';
import {edgeKnobs, pickRetune2} from '../../../benchmark/lib/retune2';
import {groupScoreNoise} from '../../../benchmark/lib/sweep';
import type {Guard, SweepRow} from '../../../benchmark/lib/sweep';
import type {TrackResult} from '../../../benchmark/lib/types';

const defaults = {priorBpm: 80, priorOctaves: 1.7, thirdBeatPenalty: 0.3, halfBeatPenalty: 0};
const guard: Guard = {floors: {'140-165': 0.5}, tracks: {'140-165': 10}};

function row(tuning: Record<string, number>, score: number, fast = 6, scoreSe = 1): SweepRow {
  return {
    stage: 'grid',
    key: JSON.stringify(tuning),
    tuning,
    sets: {},
    score,
    scoreSe,
    bands: {'140-165': {tracks: 10, correct: fast}},
  };
}

const grid = (score: (bpm: number, octaves: number) => number) => [60, 80, 100].flatMap(priorBpm => [1, 1.7, 2.4].map(priorOctaves => row({priorBpm, priorOctaves}, score(priorBpm, priorOctaves))));

describe('RBA-51 third sweep rule', () => {
  it('picks the locked settings when they are interior and within noise', () => {
    const outcome = pickRetune2([row({}, 70), ...grid((bpm, octaves) => (bpm === 100 && octaves === 1 ? 70.5 : 69))], guard, defaults);

    expect(outcome.chosen?.tuning).to.deep.equal({});
  });

  it('refuses when only an edge is within noise of the best', () => {
    const outcome = pickRetune2(grid((bpm, octaves) => (bpm === 100 && octaves === 2.4 ? 80 : 60)), guard, defaults);

    expect(outcome.chosen).to.equal(null);
    expect(outcome.refusal).to.include('priorBpm');
  });

  it('prefers an interior row within noise, then the fewest knobs moved', () => {
    const rows = grid((bpm, octaves) => (bpm === 100 && octaves === 2.4 ? 75 : (bpm === 80 ? 74.5 : 60)));
    const outcome = pickRetune2(rows, guard, defaults);

    expect(outcome.chosen?.tuning).to.deep.equal({priorBpm: 80, priorOctaves: 1.7});
  });

  it('lets no row under the guard win, however it scores', () => {
    const outcome = pickRetune2([row({priorBpm: 80}, 90, 4), row({priorBpm: 60}, 50), row({priorBpm: 100}, 50)], guard, defaults);

    expect(outcome.best?.score).to.equal(50);
  });

  it('counts no penalty as the end of the knob, not of the grid', () => {
    const rows = [0, 0.15, 0.3].map(thirdBeatPenalty => row({thirdBeatPenalty}, 70));

    expect(edgeKnobs(rows[0], rows, defaults)).to.deep.equal([]);
    expect(edgeKnobs(rows[2], rows, defaults)).to.deep.equal(['thirdBeatPenalty']);
  });

  it('reads an unset knob as its default on that axis', () => {
    const rows = [row({}, 70), row({halfBeatPenalty: 0.15}, 70), row({halfBeatPenalty: 0.3}, 70)];

    expect(edgeKnobs(rows[0], rows, defaults)).to.deep.equal([]);
  });
});

describe('group-aware score noise', () => {
  const result = (set: string, group: string, isRight: boolean): TrackResult => ({
    set, id: `${group}-${String(isRight)}-${Math.random()}`, genre: 'g', group, truth: 120, duration: 30, final: isRight ? 120 : 60, firstReadingAt: 1, firstCorrectAt: null, stable: [],
  });

  it('is wider when an artist\'s tracks move together', () => {
    const independent = Array.from({length: 40}, (_, i) => result('a', `g${i}`, i % 2 === 0));
    const clustered = Array.from({length: 40}, (_, i) => result('a', `g${Math.floor(i / 10)}`, Math.floor(i / 10) % 2 === 0));

    expect(groupScoreNoise(clustered)).to.be.greaterThan(groupScoreNoise(independent) * 1.5);
  });

  it('gives the same error on every call', () => {
    const results = Array.from({length: 20}, (_, i) => result('a', `g${i % 5}`, i % 3 === 0));

    expect(groupScoreNoise(results)).to.equal(groupScoreNoise(results));
  });
});
