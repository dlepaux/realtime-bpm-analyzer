import {expect} from 'chai';
import {compareSplit, exitStatus, isComplete, isUnpacked, pinOf, sources, wholeSets} from '../../../benchmark/lib/sources';
import type {Split, Track} from '../../../benchmark/lib/types';

const track = (id: string): Track => ({set: 's', id, genre: 'g', bpm: 120, group: id, audioPath: id, licence: 'CC0-1.0'});

const frozen = {seed: 'seed', dev: ['a', 'b'], heldout: ['c']};
const dealt = new Map<string, Split>([['a', 'dev'], ['b', 'dev'], ['c', 'heldout']]);

describe('benchmark sources', () => {
  it('passes a rebuild that matches its frozen split', () => {
    const report = compareSplit(frozen, [track('a'), track('b'), track('c')], dealt, () => true);

    expect(report.found).to.equal(3);
    expect(isComplete(report)).to.equal(true);
  });

  it('reports an id that did not come back', () => {
    const report = compareSplit(frozen, [track('a'), track('c')], dealt, () => true);

    expect(report.missing).to.deep.equal(['b']);
    expect(isComplete(report)).to.equal(false);
  });

  it('counts a label without audio as missing', () => {
    const report = compareSplit(frozen, [track('a'), track('b'), track('c')], dealt, candidate => candidate.id !== 'c');

    expect(report.missing).to.deep.equal(['c']);
    expect(report.found).to.equal(2);
  });

  it('fails a set that a loader could not read at all', () => {
    const report = compareSplit(frozen, [], new Map(), () => true);

    expect(report.missing).to.have.length(3);
    expect(isComplete(report)).to.equal(false);
  });

  it('reports a track the seed now deals to the other side', () => {
    const moved = new Map<string, Split>([['a', 'heldout'], ['b', 'dev'], ['c', 'heldout']]);
    const report = compareSplit(frozen, [track('a'), track('b'), track('c')], moved, () => true);

    expect(report.differs).to.deep.equal(['a']);
    expect(isComplete(report)).to.equal(false);
  });

  it('notes a new id without failing on it: a split never grows', () => {
    const report = compareSplit(frozen, [track('a'), track('b'), track('c'), track('d')], dealt, () => true);

    expect(report.unexpected).to.deep.equal(['d']);
    expect(isComplete(report)).to.equal(true);
  });

  it('skips the deal check for a set whose split does not come from the seed', () => {
    const report = compareSplit(frozen, [track('a'), track('b'), track('c')], null, () => true);

    expect(report.differs).to.deep.equal([]);
  });

  it('does not call a set whole when one of its sources failed, even with every id present', () => {
    const report = compareSplit(frozen, [track('a'), track('b'), track('c')], dealt, () => true);
    const reports = {ballroom: report, gtzan: report};

    expect(wholeSets(['ballroom', 'gtzan'], reports, ['gtzan-audio'])).to.deep.equal(['ballroom']);
    expect(wholeSets(['ballroom', 'gtzan'], reports, [])).to.deep.equal(['ballroom', 'gtzan']);
  });

  it('pins each source distinctly, so a changed pin is noticed', () => {
    expect(new Set(sources.map(source => pinOf(source))).size).to.equal(sources.length);
  });

  it('pins downloaded files to the label commit that lists their hashes', () => {
    const labels = sources.find(source => source.name === 'giantsteps-labels')!;
    const audio = sources.find(source => source.name === 'giantsteps-audio')!;

    expect(pinOf(audio)).to.include(pinOf(labels));
  });

  it('never takes an unpack killed by a signal for unzip\'s tolerated warning', () => {
    expect(isUnpacked('a.zip', exitStatus(1))).to.equal(true);
    expect(isUnpacked('a.zip', exitStatus(null))).to.equal(false);
    expect(isUnpacked('a.tar.gz', exitStatus(1))).to.equal(false);
    expect(isUnpacked('a.tar.gz', exitStatus(0))).to.equal(true);
  });

  it('has a source for every set', () => {
    const covered = new Set(sources.flatMap(source => source.sets));

    expect([...covered].sort()).to.deep.equal(['ballroom', 'fsld', 'fsld-nc', 'giantsteps', 'groove', 'gtzan', 'guitarset']);
  });

  it('pins every source, over https', () => {
    for (const source of sources) {
      const url = source.kind === 'files' ? source.baseUrl : source.url;

      expect(url, source.name).to.match(/^https:\/\//);

      if (source.kind === 'archive') {
        expect(source.hash.value, source.name).to.match(source.hash.algorithm === 'md5' ? /^[\da-f]{32}$/ : /^[\da-f]{64}$/);
      } else if (source.kind === 'git') {
        expect(source.commit, source.name).to.match(/^[\da-f]{40}$/);
      }
    }
  });
});
