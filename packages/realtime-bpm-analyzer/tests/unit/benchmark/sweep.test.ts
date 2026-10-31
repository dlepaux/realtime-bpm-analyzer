import {expect} from 'chai';
import {assertReplayable, bestRow, fastTempoGuard, guardShortfalls, parseRows, pickWithGuard, priorKnobsOnEdge, rowKey, scoreNoise, scoreOf, simplestWithinNoise, stageTunings, tuningKey} from '../../../benchmark/lib/sweep';
import type {SetMetrics, SweepRow, SweepStage} from '../../../benchmark/lib/sweep';
import {bandCounts} from '../../../benchmark/lib/metrics';
import type {BandCount} from '../../../benchmark/lib/metrics';
import type {TrackResult} from '../../../benchmark/lib/types';

const share = ({correct, tracks}: BandCount) => correct / tracks;

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

  describe('the noise rule', () => {
    const sizes = {a: 100, b: 400};
    const sets = {a: metrics(0.8, 0.2, 0.5), b: metrics(0.6, 0.4, 1)};
    const scored = (score: number, tuning: SweepRow['tuning']): SweepRow => ({...row(score, tuning), sets});
    const base = {priorBpm: 136, combBeats: 4, stableMargin: 1.25};

    it('adds each metric\'s binomial variance, in score points, over the sets', () => {
      const variance = (1e4 * 0.16 / 100) + (2500 * 0.16 / 50) + (225 * 0.25 / 100) + (1e4 * 0.24 / 400) + (2500 * 0.24 / 400);

      expect(scoreNoise(scored(0, {}), sizes)).to.be.closeTo(Math.sqrt(variance) / 2, 1e-9);
    });

    it('does not divide by zero for a set that never fired', () => {
      expect(scoreNoise({...row(0, {}), sets: {a: metrics(0.5, null, 0)}}, {a: 100})).to.equal(5);
    });

    it('takes fewer knobs moved over a higher score inside the noise, and ignores a value left at its base', () => {
      const chosen = simplestWithinNoise([
        scored(50, {priorBpm: 110, combBeats: 2}),
        scored(49.9, {priorBpm: 110, combBeats: 4}),
        scored(49.5, {priorBpm: 120}),
      ], sizes, base);

      expect(chosen?.key).to.equal(tuningKey({priorBpm: 110, combBeats: 4}));
    });

    it('breaks a tie in knobs by score, and refuses a simpler row outside the noise', () => {
      const noise = scoreNoise(scored(0, {}), sizes);
      const chosen = simplestWithinNoise([
        scored(49.9, {priorBpm: 120, combBeats: 2}),
        scored(50, {priorBpm: 110, combBeats: 2}),
        scored(50 - noise - 0.01, {}),
      ], sizes, base);

      expect(chosen?.score).to.equal(50);
    });

    it('has no choice without rows', () => {
      expect(simplestWithinNoise([], sizes, base)).to.equal(null);
    });
  });

  describe('the fast-tempo guard', () => {
    const sets = {a: metrics(0.8, 0.2, 0.5)};
    const sizes = {a: 100};
    const base = {priorBpm: 136};
    const bands = (slow: number, fast: number) => ({'140-165': {tracks: 170, correct: slow}, '165+': {tracks: 90, correct: fast}});
    const guarded = (score: number, tuning: SweepRow['tuning'], counts: SweepRow['bands']): SweepRow => ({...row(score, tuning), sets, bands: counts});

    it('holds what peaks reads on dev, in results/rba-51-dev.json', async () => {
      const response = await fetch(new URL('../../../benchmark/results/rba-51-dev.json', import.meta.url));
      const {results} = await response.json() as {results: {peaks: TrackResult[]}};

      expect(fastTempoGuard['140-165']).to.equal(share(bandCounts(results.peaks)['140-165']));
      expect(fastTempoGuard['165+']).to.equal(share(bandCounts(results.peaks)['165+']));
    });

    it('passes a tie and fails one track under, on each band alone', () => {
      expect(guardShortfalls(bands(92, 22))).to.deep.equal([]);
      expect(guardShortfalls(bands(91, 22))).to.deep.equal(['140-165']);
      expect(guardShortfalls(bands(92, 21))).to.deep.equal(['165+']);
    });

    it('fails a row with no count: no evidence is no pass', () => {
      expect(guardShortfalls(undefined)).to.deep.equal(['140-165', '165+']);
      expect(guardShortfalls({'140-165': {tracks: 0, correct: 0}, '165+': {tracks: 90, correct: 90}})).to.deep.equal(['140-165']);
    });

    it('never picks a row under the guard, whatever its score', () => {
      const chosen = pickWithGuard([guarded(90, {priorBpm: 110}, bands(170, 1)), guarded(50, {priorBpm: 130}, bands(100, 30))], sizes, base);

      expect(chosen?.tuning.priorBpm).to.equal(130);
    });

    it('takes its noise floor from the best row that passes, not the best row', () => {
      const chosen = pickWithGuard([
        guarded(90, {priorBpm: 136}, bands(170, 1)),
        guarded(50, {priorBpm: 136, combBeats: 2}, bands(100, 30)),
        guarded(49.9, {priorBpm: 130}, bands(100, 30)),
      ], sizes, base);

      expect(chosen?.score).to.equal(50);
    });

    it('has no pick when nothing passes, which means no look', () => {
      expect(pickWithGuard([guarded(90, {}, bands(0, 0))], sizes, base)).to.equal(null);
    });

    it('builds the next stage on the best row that passes', () => {
      const stage: SweepStage = {name: 'two', oneAtATime: true, axes: {combBeats: [2]}};
      const rows = [guarded(90, {priorBpm: 110}, bands(170, 1)), guarded(50, {priorBpm: 130}, bands(100, 30))];

      expect(stageTunings(stage, rows)).to.deep.equal([{priorBpm: 130, combBeats: 2}]);
    });

    it('names a prior held at the end of its grid, and only then', () => {
      const stages = [{name: 'ref', axes: {priorBpm: [136], priorOctaves: [0.8]}}, {name: 'grid', axes: {priorBpm: [80, 120, 170], priorOctaves: [0.4, 1, 2.4]}}];

      expect(priorKnobsOnEdge(row(1, {priorBpm: 120, priorOctaves: 1}), stages)).to.deep.equal([]);
      expect(priorKnobsOnEdge(row(1, {priorBpm: 170, priorOctaves: 0.4}), stages)).to.deep.equal(['priorBpm', 'priorOctaves']);
    });

    it('reads the edge across plans, so a later run can bracket an earlier pick', () => {
      const stages = [{name: 'grid', axes: {priorBpm: [80, 170], priorOctaves: [0.4, 2.4]}}, {name: 'below', axes: {priorBpm: [50, 70], priorOctaves: [0.4, 2.4]}}];

      expect(priorKnobsOnEdge(row(1, {priorBpm: 80, priorOctaves: 1}), stages)).to.deep.equal([]);
      expect(priorKnobsOnEdge(row(1, {priorBpm: 50, priorOctaves: 1}), stages)).to.deep.equal(['priorBpm']);
    });

    it('keeps a tuning on two ranges as two rows', () => {
      expect(rowKey({priorBpm: 120}, {min: 50, max: 240})).to.not.equal(rowKey({priorBpm: 120}, {min: 90, max: 180}));
    });
  });
});
