import {expect} from 'chai';
import {HYSTERESIS} from '../../../src/contract/types';
import type {Hysteresis, WorkletMessage} from '../../../src/contract/types';
import {
  baseRowIndex, compactTrace, expandTrace, factorialGrid, hysteresisFields, oneAtATimeGrid, readingsAt, scoreReplay, scoreRow, sweepGrids,
  sweepTrack, tempogramAxes,
} from '../../../benchmark/lib/hysteresis';
import {
  edgeFieldsOf, isEligible, metricNames, metricsOf, pickedSamples, pickHysteresis, pickRow, resamples, rowScores,
} from '../../../benchmark/lib/hysteresis-pick';
import type {Interval, MetricName, RowReport} from '../../../benchmark/lib/hysteresis-pick';
import {offersOf, replayTracker, streamPcm, traceEngine} from '../../../benchmark/lib/stream';
import type {EngineTraceStep, Observation} from '../../../benchmark/lib/stream';
import type {Track, TrackResult} from '../../../benchmark/lib/types';
import {createClickTrack} from '../../fixtures/click-track';

const sampleRate = 44_100;

/** Clicks at one tempo, a gap with no pulse, then another tempo: locks, a lost pulse and a new lock */
function changingTrack(): Float32Array {
  const first = createClickTrack(120, sampleRate, 20);
  const second = createClickTrack(150, sampleRate, 20);
  const pcm = new Float32Array(first.length + (5 * sampleRate) + second.length);
  pcm.set(first);
  pcm.set(second, first.length + (5 * sampleRate));
  return pcm;
}

/** What the main thread saw that a tracker decides: each reading with its status, and each move with its reason */
const fromSession = (message: WorkletMessage): string | null => {
  if (message.type !== 'step') {
    return null;
  }

  if (message.status === 'listening') {
    return message.reason === undefined ? null : `listening::${message.reason}`;
  }

  return `${message.status}:${message.reading.bpm}:${message.reason ?? ''}`;
};

const tuningOf = (row: Hysteresis) => ({stableTolerance: row.lockBand, stableSeconds: row.lockAfterSeconds});

describe('the hysteresis replay', () => {
  const rows: Hysteresis[] = [
    HYSTERESIS,
    {lockBand: 0.01, lockAfterSeconds: 6, unlockBand: 0.03, unlockAfterSeconds: 1, pulseLostAfterSeconds: 1},
    {lockBand: 0.03, lockAfterSeconds: 10, unlockBand: 0.06, unlockAfterSeconds: 5, pulseLostAfterSeconds: 5},
  ];

  for (const row of rows) {
    it(`sees what the real session sends, for ${JSON.stringify(row)}`, async () => {
      const pcm = changingTrack();
      const sent: string[] = [];
      await streamPcm(pcm, sampleRate, {engine: 'tempogram'}, message => {
        const seen = fromSession(message);
        if (seen !== null) {
          sent.push(seen);
        }
      }, tuningOf(row), row);

      const replayed = replayTracker(await traceEngine(pcm, sampleRate, {engine: 'tempogram'}, tuningOf(row)), row)
        .map(({status, bpm, reason}) => (status === 'listening'
          ? (reason === undefined ? null : `listening::${reason}`)
          : (bpm === null ? null : `${status}:${bpm}:${reason ?? ''}`)))
        .filter(seen => seen !== null);

      expect(sent.some(seen => seen.startsWith('locked'))).to.equal(true);
      expect(replayed).to.deep.equal(sent);
    });
  }

  // The sweep traces each track once at the contract's lock fields and replays every other pair from that trace
  for (const [lockBand, lockAfterSeconds] of [[0.02, 8], [0.01, 6], [0.015, 4], [0.03, 10], [0.04, 12]]) {
    it(`replays the engine's own lock offers at a band of ${lockBand} over ${lockAfterSeconds} s`, async () => {
      const pcm = changingTrack();
      const traced = await traceEngine(pcm, sampleRate, {engine: 'tempogram'});
      const own = await traceEngine(pcm, sampleRate, {engine: 'tempogram'}, {stableTolerance: lockBand, stableSeconds: lockAfterSeconds});

      expect(traced.map(({now, bpm, frameTempo}) => [now, bpm, frameTempo])).to.deep.equal(own.map(({now, bpm, frameTempo}) => [now, bpm, frameTempo]));
      expect(own.some(({lockOffered}) => lockOffered)).to.equal(true);
      expect(offersOf(traced, lockBand, lockAfterSeconds)).to.deep.equal(own.map(({lockOffered}) => lockOffered));
    });
  }

  it('scores a replay as it scores the replay\'s observations', async () => {
    const steps = await traceEngine(changingTrack(), sampleRate, {engine: 'tempogram'});
    const row = rows[1];
    const offers = offersOf(steps, row.lockBand, row.lockAfterSeconds);
    expect(scoreReplay(steps, row, offers, 120, 45)).to.deep.equal(scoreRow(replayTracker(steps, row, offers), 120, 45));
  });

  it('keeps a trace whole through its compact form', async () => {
    const steps = await traceEngine(changingTrack(), sampleRate, {engine: 'tempogram'});
    const back = expandTrace(JSON.parse(JSON.stringify(compactTrace(steps))) as ReturnType<typeof compactTrace>);
    const exact = (step: EngineTraceStep) => [step.now, step.bpm, step.pulse, step.leads, step.lockOffered, step.frameTempo];
    expect(back.map(step => exact(step))).to.deep.equal(steps.map(step => exact(step)));
    expect(back.every(({confidence}, i) => Math.abs((confidence ?? 0) - (steps[i].confidence ?? 0)) < 1e-6)).to.equal(true);
  });

  it('refuses peaks, whose steps depend on the tracker', async () => {
    let error: unknown;
    await traceEngine(new Float32Array(sampleRate), sampleRate, {engine: 'peaks'}).catch((caught: unknown) => {
      error = caught;
    });
    expect(error).to.be.instanceOf(Error);
  });
});

describe('scoreRow', () => {
  const at = (now: number, status: Observation['status'], bpm: number | null): Observation => ({now, status, bpm});

  it('counts the first lock, the time locked on a wrong tempo, unlocks and losses', () => {
    const row = scoreRow([
      at(5, 'settling', 100),
      at(10, 'locked', 120),
      at(20, 'locked', 150),
      at(25, 'settling', 150),
      at(30, 'locked', 121),
      at(40, 'listening', null),
    ], 120, 60);
    // Locked 10 to 25 and 30 to 40: wrong 20 to 25 only
    expect(row.slice(0, 6)).to.deep.equal([10, 1, 25, 5, 1, 1]);
  });

  it('keeps the shown reading over a step that sent none, and counts a lock to the end', () => {
    const row = scoreRow([at(10, 'locked', 90), at(12, 'locked', null)], 120, 20);
    expect(row.slice(0, 4)).to.deep.equal([10, 0, 10, 10]);
  });

  it('reads no lock as -1', () => {
    expect(scoreRow([at(4, 'settling', 120)], 120, 30)[0]).to.equal(-1);
  });

  it('gives the status at 10, 15, 20, 30, 45 s inside the track, then at the end', () => {
    const steps = [at(8, 'settling', 120), at(16, 'locked', 121), at(18, 'locked', null), at(22, 'listening', null)];
    expect(scoreRow(steps, 120, 40)[6]).to.equal('11200');
    expect(scoreRow(steps, 120, 60)[6]).to.equal('112000');
    // A step at a sample time is what shows there
    expect(scoreRow([at(10, 'locked', 120)], 120, 12)[6]).to.equal('22');
    expect(scoreRow([], 120, 12)[6]).to.equal('00');
  });
});

describe('readingsAt', () => {
  it('gives the reading last shown, whatever the status, null before the first', () => {
    const steps = [
      {now: 8, bpm: 120, confidence: 0.2},
      {now: 16, bpm: 121, confidence: 0.6},
      {now: 18, bpm: null, confidence: null},
    ];
    expect(readingsAt(steps, 25)).to.deep.equal([[120, 0.2], [120, 0.2], [121, 0.6], [121, 0.6]]);
    expect(readingsAt([], 12)).to.deep.equal([null, null]);
  });
});

describe('the sweep grids', () => {
  it('holds the contract\'s values, and unlocks only on a wider band than it locks', () => {
    for (const engine of ['tempogram', 'peaks'] as const) {
      expect(baseRowIndex(engine)).to.be.at.least(0);
      expect(sweepGrids[engine].every(row => row.unlockBand > row.lockBand)).to.equal(true);
    }

    // 17 band pairs with the unlock band wider, 5 dwell times, 4 by 4 unlock and pulse times
    expect(factorialGrid(tempogramAxes)).to.have.length(1360);
    expect(sweepGrids.peaks).to.have.length(10);
  });

  it('keeps rows sharing their lock fields together, so they share their lock offers', () => {
    const keys = sweepGrids.tempogram.map(row => `${row.lockBand}/${row.lockAfterSeconds}`);
    const runs = keys.filter((key, index) => index === 0 || key !== keys[index - 1]);
    expect(runs).to.have.length(new Set(keys).size);
  });

  it('moves one field at a time from the base', () => {
    const grid = oneAtATimeGrid({...tempogramAxes, lockBand: [0.02], lockAfterSeconds: [8]}, HYSTERESIS);
    expect(grid[0]).to.deep.equal(HYSTERESIS);
    expect(grid).to.have.length(10);
  });

  it('names the fields at an edge of a swept axis, and never an axis of one value', () => {
    expect(edgeFieldsOf(HYSTERESIS, 'tempogram')).to.deep.equal([]);
    expect(edgeFieldsOf(HYSTERESIS, 'peaks')).to.deep.equal([]);
    expect(edgeFieldsOf({...HYSTERESIS, lockBand: 0.01, pulseLostAfterSeconds: 5}, 'tempogram')).to.deep.equal(['lockBand', 'pulseLostAfterSeconds']);
    expect(edgeFieldsOf({...HYSTERESIS, unlockAfterSeconds: 1}, 'peaks')).to.deep.equal(['unlockAfterSeconds']);
  });
});

/** A report whose metrics are all zero with no noise, but its false-locked share and the given differences */
function report(hysteresis: Hysteresis, falseLocked: number, againstBase: Partial<Record<MetricName, Interval>> = {}): RowReport {
  const zero = Object.fromEntries(metricNames.map(name => [name, [0, 0, 0] as const])) as Record<MetricName, Interval>;
  const against = {...zero, ...againstBase};
  return {hysteresis, metrics: {...zero, falseLocked: [falseLocked, falseLocked, falseLocked]}, againstBase: against, eligible: isEligible(against)};
}

describe('the pick rule', () => {
  const grid = sweepGrids.tempogram;
  const base = baseRowIndex('tempogram');
  const rowWith = (fields: Partial<Hysteresis>) => {
    const wanted: Hysteresis = {...HYSTERESIS, ...fields};
    return grid.findIndex(row => hysteresisFields.every(field => row[field] === wanted[field]));
  };
  // Interior rows one and two fields from the base, and a row at an edge
  const oneMoved = rowWith({lockBand: 0.03});
  const twoMoved = rowWith({lockBand: 0.03, unlockAfterSeconds: 3});
  const edge = rowWith({lockBand: 0.01});
  // The difference of i less j: within the noise when the values are within 0.01
  const against = (rows: readonly RowReport[]) => (i: number, j: number): Interval => {
    const d = rows[i].metrics.falseLocked[0] - rows[j].metrics.falseLocked[0];
    return [d, d - 0.01, d + 0.01];
  };
  const pickOf = (falseLocked: (index: number) => number, againstBase: (index: number) => Partial<Record<MetricName, Interval>> = () => ({})) => {
    const rows = grid.map((row, index) => report(row, falseLocked(index), againstBase(index)));
    return pickRow('tempogram', rows, against(rows));
  };

  it('finds its rows in the grid', () => {
    expect([oneMoved, twoMoved, edge].every(index => index >= 0 && index !== base)).to.equal(true);
    expect(edgeFieldsOf(grid[twoMoved], 'tempogram')).to.deep.equal([]);
  });

  it('keeps the base when no row beats it beyond the noise', () => {
    const pick = pickOf(index => (index === base ? 0.1 : 0.095));
    expect(pick.pick).to.equal(base);
    expect(pick.bracketed).to.equal(true);
  });

  it('moves to an interior row within the noise of the best, before the best at an edge', () => {
    const pick = pickOf(index => (index === edge ? 0.035 : (index === twoMoved ? 0.04 : 0.1)));
    expect(pick.best).to.equal(edge);
    expect(pick.pick).to.equal(twoMoved);
    expect(pick.bracketed).to.equal(true);
  });

  it('prefers the row that moves fewer fields from the base', () => {
    const pick = pickOf(index => (index === oneMoved ? 0.045 : (index === twoMoved ? 0.04 : 0.1)));
    expect(pick.pick).to.equal(oneMoved);
  });

  it('flags the pick when only a row at an edge is near the best', () => {
    const pick = pickOf(index => (index === edge ? 0.04 : 0.1));
    expect(pick.pick).to.equal(edge);
    expect(pick.bracketed).to.equal(false);
    expect(pick.edgeFields).to.deep.equal(['lockBand']);
  });

  it('refuses a row that flaps more, locks later or covers less beyond the noise', () => {
    expect(isEligible(report(HYSTERESIS, 0, {flapping: [0.2, 0.1, 0.3]}).againstBase)).to.equal(false);
    expect(isEligible(report(HYSTERESIS, 0, {medianFirstLock: [1, 0.5, 1.5]}).againstBase)).to.equal(false);
    expect(isEligible(report(HYSTERESIS, 0, {coverage: [-0.02, -0.03, -0.01]}).againstBase)).to.equal(false);
    expect(isEligible(report(HYSTERESIS, 0, {coverage: [-0.01, -0.03, 0.01], flapping: [0.1, -0.1, 0.3]}).againstBase)).to.equal(true);
  });

  it('never picks an ineligible row, however low its false-locked share', () => {
    const pick = pickOf(index => (index === oneMoved ? 0 : 0.1), index => (index === oneMoved ? {coverage: [-0.1, -0.2, -0.05]} : {}));
    expect(pick.pick).to.equal(base);
  });
});

describe('the resamples', () => {
  const result = (set: string, group: string): TrackResult => ({set, id: `${set}-${group}`, genre: '', group, truth: 120, duration: 60, final: 120, firstReadingAt: null, firstCorrectAt: null, stable: []});

  it('starts with the data, then draws artists within each set, seeded', () => {
    const results = [result('fsld', 'a'), result('fsld', 'b'), result('free-mixes', 'a')];
    const first = resamples(results);
    expect([...first.weights[0]]).to.deep.equal([1, 1, 1]);
    expect(first.weights.every(weight => weight[0] + weight[1] === 2 && weight[2] === 1)).to.equal(true);
    expect(first.weights.map(weight => [...weight])).to.deep.equal(resamples(results).weights.map(weight => [...weight]));
  });

  it('computes shares and the weighted median of the first locks', () => {
    // Two clusters: [tracks, locking, right, locked s, wrong s, unlocks, losses, minutes]
    const totals = new Float64Array([2, 2, 1, 40, 10, 1, 0, 2, 1, 0, 0, 0, 0, 0, 0, 1]);
    const metrics = metricsOf(totals, [[8, 0], [12, 0]], new Float64Array([1, 1]));
    expect(metrics.slice(0, 5)).to.deep.equal([2 / 3, 0.5, 0.25, 1 / 3, 0]);
    expect(metrics.slice(5)).to.deep.equal([8, 12]);
  });
});

describe('the sweep, end to end', function () {
  this.timeout(120_000);
  const tracks: Track[] = [
    {set: 'fsld', id: 'clicks-120', genre: 'test', bpm: 120, group: 'a', audioPath: '', licence: 'CC0-1.0'},
    {set: 'free-mixes', id: 'clicks-150', genre: 'test', bpm: 150, group: 'b', audioPath: '', licence: 'CC0-1.0'},
  ];
  const results: Record<'tempogram' | 'peaks', TrackResult[]> = {tempogram: [], peaks: []};

  before(async () => {
    for (const engine of ['tempogram', 'peaks'] as const) {
      results[engine] = await Promise.all(tracks.map(async track => sweepTrack(track, createClickTrack(track.bpm, sampleRate, 25), sampleRate, engine)));
    }
  });

  it('keeps a trace for the tempogram and every row for peaks', () => {
    const [tempogram, peaks] = [results.tempogram[0].hysteresis, results.peaks[0].hysteresis];
    expect(tempogram?.engine === 'tempogram' && tempogram.trace.now.length > 0).to.equal(true);
    expect(peaks?.engine === 'peaks' && peaks.rows.length === sweepGrids.peaks.length && peaks.readings.length === sweepGrids.peaks.length).to.equal(true);
  });

  it('scores every row, and the base row as a replay at the contract\'s values does', () => {
    const scores = [...rowScores('tempogram', results.tempogram)];
    expect(scores).to.have.length(sweepGrids.tempogram.length);
    const record = results.tempogram[0].hysteresis;
    const steps = record?.engine === 'tempogram' ? expandTrace(record.trace) : [];
    expect(scores[baseRowIndex('tempogram')][0]).to.deep.equal(scoreRow(replayTracker(steps, HYSTERESIS), 120, 25));
  });

  it('picks a row of each engine and gives what it showed at 10, 15 and 20 s and the end', () => {
    for (const engine of ['tempogram', 'peaks'] as const) {
      const pick = pickHysteresis(engine, results[engine]);
      expect(pick.rows).to.have.length(sweepGrids[engine].length);
      expect(pick.pick).to.be.within(0, sweepGrids[engine].length - 1);
      const samples = pickedSamples(engine, results[engine], pick.pick);
      expect(samples.map(({statuses, readings}) => [statuses.length, readings.length])).to.deep.equal([[4, 4], [4, 4]]);
    }
  });
});
