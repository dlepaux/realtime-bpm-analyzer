import {expect} from 'chai';
import {against285, candidate, gatedBands, heldoutTracks, lookFaults, measure, outOfRange, passBar, reference, reference285} from '../../../benchmark/lib/pass-bar';
import {detectors, lookDetectors, pickedConfiguration} from '../../../benchmark/lib/detectors';
import {parseRows, pickWithGuard} from '../../../benchmark/lib/sweep';
import {defaultTempogramTuning, extensionTempogramMode} from '../../../src/core/tempogram';
import type {TrackResult} from '../../../benchmark/lib/types';

type Track = {set: string; id: string; group: string; truth: number};

/** Tracks in the bar's sets and bands: a slow one and one per gated band, per group */
function tracksFor(set: string, groups: number): Track[] {
  return Array.from({length: groups}, (_, group) => [100, 150, 172].map(truth => ({set, id: `${group}-${truth}`, group: `g${group}`, truth}))).flat();
}

const everyTrack = ['fsld', 'groove', 'guitarset', 'giantsteps'].flatMap(set => tracksFor(set, 20));

/** A detector reading each track right when `reads` says so, its stable reading following */
function detector(tracks: readonly Track[], reads: (track: Track, index: number) => boolean): TrackResult[] {
  return tracks.map((track, index) => {
    const final = reads(track, index) ? track.truth : track.truth * 1.3;

    return {set: track.set, id: track.id, group: track.group, genre: 'x', truth: track.truth, duration: 30, final, firstReadingAt: 4, firstCorrectAt: null, stable: [[12, final]]};
  });
}

const results = (reads: (track: Track, index: number) => boolean, peaks: (track: Track, index: number) => boolean) => ({
  [candidate]: detector(everyTrack, reads),
  [reference]: detector(everyTrack, peaks),
  [reference285]: detector(everyTrack, peaks),
});

const everyOther = (_: Track, index: number) => index % 2 === 0;

describe('the pass bar of RBA-51', () => {
  it('passes a candidate clearly ahead everywhere', () => {
    const conditions = passBar(results(() => true, everyOther));

    expect(conditions.filter(({isMet}) => !isMet)).to.deep.equal([]);
    expect(conditions.map(({bar}) => bar)).to.include.members([1, 2, 3, 4]);
  });

  it('fails bar 1 on a tie, and lets bar 2 and 3 through it: above and not below differ', () => {
    const conditions = passBar(results(everyOther, everyOther));

    expect(conditions.filter(({bar}) => bar === 1).every(({isMet}) => !isMet)).to.equal(true);
    expect(conditions.filter(({bar}) => bar === 2 || bar === 3).every(({isMet}) => isMet)).to.equal(true);
  });

  it('fails bar 2 when one fast band loses beyond noise, however good the rest', () => {
    const conditions = passBar(results(track => track.truth !== 172, () => true));

    expect(conditions.filter(({bar, what, isMet}) => bar === 2 && what.includes('165-180') && !isMet)).to.have.length(4);
    expect(conditions.filter(({bar, what, isMet}) => bar === 2 && what.includes('140-165') && !isMet)).to.have.length(0);
  });

  it('gives bar 4 no noise: a false-stable barely above peaks fails', () => {
    const slightlyWorse = results(everyOther, everyOther);
    const [first] = slightlyWorse[candidate];
    const correct = slightlyWorse[candidate].findIndex(({final, truth}) => final === truth);

    expect(first.final).to.equal(first.truth);
    slightlyWorse[candidate][correct] = {...slightlyWorse[candidate][correct], stable: [[12, first.truth * 1.3]]};

    expect(passBar(slightlyWorse).filter(({bar, isMet}) => bar === 4 && !isMet)).to.not.deep.equal([]);
  });

  it('counts a false-stable of silence as all false, so a candidate that never fires fails bar 4', () => {
    const silent = results(() => true, everyOther);

    silent[candidate] = silent[candidate].map(result => ({...result, stable: []}));

    expect(passBar(silent).filter(({bar, isMet}) => bar === 4 && !isMet)).to.have.length(2);
  });

  it('fails bar 4 when peaks never fires in a set, instead of reading it as all false', () => {
    const silentPeaks = results(() => true, everyOther);

    silentPeaks[reference] = silentPeaks[reference].map(result => (result.set === 'groove' ? {...result, stable: []} : result));

    expect(passBar(silentPeaks).filter(({bar, isMet}) => bar === 4 && !isMet)).to.have.length(2);
  });

  it('shows at one standard error what the width of the noise decided, without deciding on it', () => {
    const [first] = passBar(results(() => true, everyOther));

    expect(first.difference!.narrowLow).to.be.greaterThan(first.difference!.low);
    expect(first.difference!.narrowHigh).to.be.lessThan(first.difference!.high);
  });

  it('keeps tracks labelled outside 90 to 180 out of the gated bands', () => {
    const inBand = (truth: number) => gatedBands.some(({tracks}) => tracks({truth} as TrackResult));

    expect(inBand(180)).to.equal(true);
    expect(inBand(180.5)).to.equal(false);
    expect(outOfRange({truth: 180.5} as TrackResult)).to.equal(true);
    expect(outOfRange({truth: 180} as TrackResult)).to.equal(false);
    expect(outOfRange({truth: 85} as TrackResult)).to.equal(true);
  });

  it('widens the range when tracks are one group, which is the point of resampling groups', () => {
    const scattered = everyTrack.filter(({set}) => set === 'fsld');
    const lumped = scattered.map(track => ({...track, group: track.id.startsWith('1') ? 'one' : 'other'}));
    const reads = (_: Track, index: number) => index % 3 === 0;
    const width = (tracks: Track[]) => {
      const range = measure({a: detector(tracks, (track, index) => track.group === 'one' || reads(track, index))}, ['a'], 'acc1', {name: 'x'});

      return range!.high - range!.low;
    };

    expect(width(lumped)).to.be.greaterThan(width(scattered));
  });

  it('gives the same verdict for the same file', () => {
    const file = results(everyOther, () => false);

    expect(passBar(file)).to.deep.equal(passBar(file));
  });

  it('reports #285 beating the candidate on 140 to 165 without gating on it', () => {
    const beaten = results(track => track.truth !== 150, everyOther);

    beaten[reference285] = detector(everyTrack, () => true);

    expect(against285(beaten).every(({beatsBeyondNoise}) => beatsBeyondNoise)).to.equal(true);
    expect(passBar(beaten).map(({what}) => what).join()).to.not.include('285');
  });

  it('refuses to measure without groups, or on tracks one detector lacks', () => {
    const file = results(() => true, everyOther);

    expect(() => measure({a: file[candidate].map(({group: _, ...rest}) => rest)}, ['a'], 'acc1', {name: 'x'})).to.throw('no group');
    expect(() => measure({...file, [reference]: file[reference].slice(1)}, [candidate, reference], 'acc1', {name: 'x'})).to.throw('missing');
  });

  describe('judging a look file', () => {
    const expected = {fsld: 60, groove: 60, guitarset: 60, giantsteps: 60};

    it('accepts a whole look', () => {
      expect(lookFaults({results: results(everyOther, everyOther), skipped: []}, expected)).to.deep.equal([]);
    });

    it('counts a skipped track against its set, and refuses one gone uncounted', () => {
      const file = results(everyOther, everyOther);
      const short = {...file, [candidate]: file[candidate].slice(1), [reference]: file[reference].slice(1), [reference285]: file[reference285].slice(1)};

      expect(lookFaults({results: short, skipped: [{set: 'fsld'}]}, expected)).to.deep.equal([]);
      expect(lookFaults({results: short, skipped: []}, expected)).to.have.length(3);
    });

    it('refuses a look that scored anything else', () => {
      expect(lookFaults({results: {...results(everyOther, everyOther), other: []}, skipped: []}, expected).join()).to.include('extra: other');
    });

    it('refuses a look that lost its groups, holds a track twice, disagrees on a label, or skipped too many', () => {
      const file = results(everyOther, everyOther);
      const twice = {...file, [reference]: [file[reference][1], ...file[reference].slice(1)]};
      const relabelled = {...file, [reference]: [{...file[reference][0], truth: 1}, ...file[reference].slice(1)]};
      const noGroup = {...file, [reference]: file[reference].map(({group: _, ...rest}) => rest)};

      expect(lookFaults({results: twice, skipped: []}, expected).join()).to.include('twice');
      expect(lookFaults({results: relabelled, skipped: []}, expected).join()).to.include('disagrees');
      expect(lookFaults({results: noGroup, skipped: []}, expected).join()).to.include('without a group');
      expect(lookFaults({results: file, skipped: Array.from({length: 4}, () => ({set: 'other'}))}, expected).join()).to.include('over the limit');
    });

    it('expects the frozen held-out sizes', () => {
      expect(Object.values(heldoutTracks).reduce((sum, tracks) => sum + tracks, 0)).to.equal(2508);
    });
  });
});

describe('what the second look fixes', () => {
  it('names the mode as the pick, and scores it with the two references and nothing else', () => {
    expect(pickedConfiguration).to.equal(candidate);
    expect(lookDetectors).to.deep.equal([reference, reference285, candidate]);
    expect(lookDetectors.every(name => Object.hasOwn(detectors, name))).to.equal(true);
  });

  it('runs the mode through its option, with no override and no lowpass', () => {
    const {options, tuning, lowpass} = detectors[candidate];

    expect(options).to.deep.equal({detector: 'tempogram', tempogramMode: 'extension'});
    expect(tuning).to.equal(undefined);
    expect(lowpass).to.equal(false);
  });

  it('holds what the dev tables measured as ridge-80', () => {
    const ridge = detectors['tempogram-ridge-80-90-180'];

    expect(extensionTempogramMode.tuning).to.deep.equal(ridge.tuning);
    expect(extensionTempogramMode.tempoRange).to.deep.equal(ridge.options.tempoRange);
  });

  // The DECISION fixed these values and amended the rule: this runs the amended rule on the committed rows
  it('comes out of the amended rule, from the rows that refused twice', async () => {
    const read = async (name: string) => parseRows(await (await fetch(new URL(`../../../benchmark/results/${name}`, import.meta.url))).text());
    const rows = [...await read('rba-51-sweep-2.jsonl'), ...await read('rba-51-sweep-3.jsonl')];
    const base = {...defaultTempogramTuning, ...detectors['tempogram-285'].tuning};
    const chosen = pickWithGuard(rows, {fsld: 791, groove: 221, guitarset: 180}, base);

    expect(rows).to.have.length(2118);
    expect(chosen?.tuning).to.deep.equal(extensionTempogramMode.tuning);
    expect(chosen?.tempoRange).to.deep.equal(extensionTempogramMode.tempoRange);
  });

  it('leaves the library defaults alone: peaks by default, and the tempogram\'s first pick', () => {
    expect(detectors.peaks.options).to.deep.equal({});
    expect(defaultTempogramTuning.priorBpm).to.equal(110);
    expect(defaultTempogramTuning.priorOctaves).to.equal(0.7);
    expect(defaultTempogramTuning.thirdBeatPenalty).to.equal(0.2);
  });
});
