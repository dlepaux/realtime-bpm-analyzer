import {expect} from 'chai';
import {assertReplayable, bestRow, parseRows, scoreOf, stageTunings, tuningKey} from '../../../benchmark/lib/sweep';
import type {SetMetrics, SweepRow, SweepStage} from '../../../benchmark/lib/sweep';

const metrics = (acc1: number, falseStable: number | null, coverage: number): SetMetrics => ({acc1, acc2: acc1, falseStable, coverage});

const row = (score: number, tuning: SweepRow['tuning'], stage = 'one'): SweepRow => ({stage, key: tuningKey(tuning), tuning, sets: {}, score});

describe('benchmark sweep', () => {
  it('keeps a row\'s key whatever order its knobs came in', () => {
    expect(tuningKey({priorBpm: 120, priorOctaves: 1})).to.equal(tuningKey({priorOctaves: 1, priorBpm: 120}));
    expect(tuningKey({priorBpm: 120})).to.not.equal(tuningKey({priorBpm: 130}));
  });

  it('scores the macro mean of the sets, so the largest set cannot pick the prior', () => {
    const score = scoreOf({a: metrics(0.8, 0.2, 0.6), b: metrics(0.6, 0.4, 0.4)});

    expect(score).to.be.closeTo(70 - 15 + 7.5, 1e-9);
  });

  it('counts a set with no stable reading as all false, never as clean', () => {
    expect(scoreOf({a: metrics(0.5, null, 0)})).to.equal(0);
  });

  it('expands every combination on top of the best row so far', () => {
    const stage: SweepStage = {name: 'two', axes: {priorBpm: [110, 120], priorOctaves: [0.7, 0.9]}};
    const tunings = stageTunings(stage, [row(1, {combBeats: 3}), row(2, {combBeats: 4})]);

    expect(tunings).to.have.length(4);
    expect(tunings).to.deep.include({combBeats: 4, priorBpm: 120, priorOctaves: 0.7});
  });

  it('gives one empty tuning for a stage without axes, the baseline', () => {
    expect(stageTunings({name: 'baseline', axes: {}}, [])).to.deep.equal([{}]);
  });

  it('moves one knob at a time when asked', () => {
    const stage: SweepStage = {name: 'two', oneAtATime: true, axes: {combBeats: [2, 3], stableMargin: [1.1]}};

    expect(stageTunings(stage, [row(1, {priorBpm: 120})])).to.deep.equal([
      {priorBpm: 120, combBeats: 2}, {priorBpm: 120, combBeats: 3}, {priorBpm: 120, stableMargin: 1.1},
    ]);
  });

  it('returns no best row before the first one', () => {
    expect(bestRow([])).to.equal(null);
  });

  it('drops a line a kill tore, keeping the rows around it', () => {
    const whole = JSON.stringify(row(1, {priorBpm: 120}));

    expect(parseRows(`${whole}\n{"stage":"on\n\n${whole}\n`)).to.have.length(2);
  });

  it('refuses a knob before the curves, which a replay would ignore', () => {
    const stages = [{name: 'x', axes: {compression: [100]}}];

    expect(() => {
      assertReplayable(stages, ['compression']);
    }).to.throw('compression');
  });

  it('refuses a knob the detector does not have', () => {
    expect(() => {
      assertReplayable([{name: 'x', axes: {priorBmp: [120]}}], ['priorBpm']);
    }).to.throw('priorBmp');
  });
});
