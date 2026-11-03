import {expect} from 'chai';
import {freeCandidate, freeLookBar, freeLookDetectors, freeLookFaults, freeLookSets, freeReference, isFreeLookPassed, voidGates} from '../../../benchmark/lib/free-look';
import {detectors} from '../../../benchmark/lib/detectors';
import {defaultTempogramRange, defaultTempogramTuning} from '../../../src/core/tempogram';
import type {TrackResult} from '../../../benchmark/lib/types';

type Track = {set: string; id: string; group: string; truth: number};

/** Per artist, a track in each gated band and one slow one, in both tiers */
const everyTrack: Track[] = freeLookSets.flatMap(set => Array.from({length: 30}, (_, artist) => [100, 150, 172].map(truth => ({set, id: `${artist}-${truth}`, group: `a${artist}`, truth}))).flat());

function detector(reads: (track: Track, index: number) => boolean, tracks: readonly Track[] = everyTrack): TrackResult[] {
  return tracks.map((track, index) => {
    const final = reads(track, index) ? track.truth : track.truth * 1.3;

    return {set: track.set, id: track.id, group: track.group, genre: 'x', truth: track.truth, duration: 60, final, firstReadingAt: 4, firstCorrectAt: null, stable: [[12, final]]};
  });
}

const results = (candidate: (track: Track, index: number) => boolean, peaks: (track: Track, index: number) => boolean) => ({
  [freeCandidate]: detector(candidate),
  [freeReference]: detector(peaks),
});

const everyOther = (_: Track, index: number) => index % 2 === 0;
const failing = (conditions: ReturnType<typeof freeLookBar>) => conditions.filter(({isMet}) => !isMet).map(({gate, what}) => `${gate}: ${what}`);

describe('the pass bar of RBA-51\'s look at the held-out free mixes', () => {
  it('passes a candidate clearly ahead everywhere, with gates 1, 2, 4 and 5', () => {
    const conditions = freeLookBar(results(() => true, everyOther));

    expect(failing(conditions)).to.deep.equal([]);
    expect(isFreeLookPassed(conditions)).to.equal(true);
    expect([...new Set(conditions.map(({gate}) => gate))]).to.deep.equal([1, 2, 4, 5]);
  });

  it('fails gate 1 on a tie, and lets gate 2 through it: above and not below differ', () => {
    const conditions = freeLookBar(results(everyOther, everyOther));

    expect(conditions.filter(({gate}) => gate === 1).every(({isMet}) => !isMet)).to.equal(true);
    expect(conditions.filter(({gate}) => gate === 2).every(({isMet}) => isMet)).to.equal(true);
    expect(isFreeLookPassed(conditions)).to.equal(false);
  });

  it('fails gate 2 when the 165-180 band loses beyond noise, however good the rest', () => {
    const conditions = freeLookBar(results(track => track.truth !== 172, () => true));

    expect(failing(conditions).filter(text => text.startsWith('2:'))).to.deep.equal(['2: acc1, 165-180, free mixes, strict', '2: acc2, 165-180, free mixes, strict']);
  });

  it('reads gate 2 against peaks only: no condition compares with 5.5.0 there', () => {
    const gate2 = freeLookBar(results(() => true, everyOther)).filter(({gate}) => gate === 2);

    expect(gate2).to.have.length(4);
    expect(gate2.every(({rule}) => rule.includes('peaks'))).to.equal(true);
    expect(voidGates.join(' ')).to.include('Gate 2 against 5.5.0').and.include('Gate 3');
  });

  it('gates on strict labels only: contested tracks move nothing', () => {
    const strictOnly = (track: Track) => track.set === 'free-mixes';
    const a = freeLookBar(results(() => true, everyOther));
    const b = freeLookBar(results(track => strictOnly(track), (track, index) => !strictOnly(track) || everyOther(track, index)));

    expect(b.map(({difference}) => difference?.value)).to.deep.equal(a.map(({difference}) => difference?.value));
  });

  it('gives gate 4 no noise: a false-stable barely above peaks fails', () => {
    const slightlyWorse = results(everyOther, everyOther);
    const at = slightlyWorse[freeCandidate].findIndex(({set, final, truth}) => set === 'free-mixes' && final === truth);

    slightlyWorse[freeCandidate][at] = {...slightlyWorse[freeCandidate][at], stable: [[12, slightlyWorse[freeCandidate][at].truth * 1.3]]};

    expect(failing(freeLookBar(slightlyWorse))).to.include('4: falseStable, free mixes, strict');
  });

  it('fails gate 4 when peaks never fires, instead of reading silence as all false', () => {
    const silentPeaks = results(() => true, everyOther);

    silentPeaks[freeReference] = silentPeaks[freeReference].map(result => ({...result, stable: []}));

    expect(failing(freeLookBar(silentPeaks))).to.include('4: falseStable, free mixes, strict');
  });

  it('meets gate 5 by construction only because the candidate is 5.5.0 as shipped', () => {
    const [gate5] = freeLookBar(results(() => true, everyOther)).filter(({gate}) => gate === 5);
    const {options, lowpass, tuning} = detectors[freeCandidate];

    expect(gate5.isMet).to.equal(true);
    expect(gate5.difference).to.equal(null);
    expect(options).to.deep.equal({engine: 'tempogram'});
    expect(lowpass).to.equal(false);
    expect(tuning).to.equal(undefined);
  });

  it('scores the library\'s locked 5.5.0 settings, and peaks with its lowpass and default range', () => {
    expect(defaultTempogramRange).to.deep.equal({min: 90, max: 180});
    expect(defaultTempogramTuning).to.include({priorBpm: 80, priorOctaves: 1.7, thirdBeatPenalty: 0.3});
    expect(detectors[freeReference]).to.deep.include({options: {}, lowpass: true});
    expect(freeLookDetectors).to.have.members(['peaks', 'tempogram']);
  });

  it('fails a band with no track: no evidence is no pass', () => {
    const slowOnly = everyTrack.filter(({truth}) => truth === 100);
    const conditions = freeLookBar({[freeCandidate]: detector(() => true, slowOnly), [freeReference]: detector(everyOther, slowOnly)});

    expect(conditions.filter(({gate, isMet}) => gate === 2 && !isMet)).to.have.length(4);
  });

  it('gives the same verdict for the same file', () => {
    const file = results(everyOther, (_, index) => index % 3 === 0);

    expect(JSON.stringify(freeLookBar(file))).to.equal(JSON.stringify(freeLookBar(file)));
  });

  describe('judging a look file', () => {
    const tracks = {'free-mixes': 90, 'free-mixes-contested': 90};
    const whole = () => ({results: results(() => true, everyOther), skipped: [] as Array<{set: string; id: string}>, tracks});

    it('accepts a whole look', () => {
      expect(freeLookFaults(whole())).to.deep.equal([]);
    });

    it('refuses a file scoring anything else, or not counting its sets', () => {
      const file = whole();

      expect(freeLookFaults({...file, results: {...file.results, 'tempogram-285-90-180': file.results[freeReference]}})[0]).to.include('The look scores');
      expect(freeLookFaults({...file, tracks: undefined})[0]).to.include('count the loader');
      expect(freeLookFaults({...file, tracks: {'free-mixes': 90}})[0]).to.include('count the loader');
    });

    it('counts a skipped track against its set, and refuses one gone uncounted', () => {
      const file = whole();
      const dropped = {...file.results, [freeCandidate]: file.results[freeCandidate].slice(1), [freeReference]: file.results[freeReference].slice(1)};
      const [first] = file.results[freeCandidate];

      expect(freeLookFaults({...file, results: dropped, skipped: [{set: first.set, id: first.id}]})).to.deep.equal([]);
      expect(freeLookFaults({...file, results: dropped})).to.have.length(2);
    });

    it('refuses a duplicate, a lost group, a label disagreement or too many skips', () => {
      const file = whole();
      const ref = file.results[freeReference];

      expect(freeLookFaults({...file, results: {...file.results, [freeReference]: [...ref, ref[0]]}})).to.include(`${freeReference} holds a track twice`);
      expect(freeLookFaults({...file, results: {...file.results, [freeReference]: ref.map(({group: _, ...rest}) => rest)}})).to.include(`${freeReference} has tracks without a group`);
      expect(freeLookFaults({...file, results: {...file.results, [freeReference]: ref.map(r => ({...r, truth: r.truth + 1}))}})).to.include(`${freeReference} disagrees with ${freeCandidate} on a label or a track`);

      const four = file.results[freeCandidate].slice(0, 4).map(({set, id}) => ({set, id}));
      const kept = (list: readonly TrackResult[]) => list.slice(4);

      expect(freeLookFaults({...file, results: {[freeCandidate]: kept(file.results[freeCandidate]), [freeReference]: kept(ref)}, skipped: four}).join()).to.include('over the limit');
    });
  });
});
