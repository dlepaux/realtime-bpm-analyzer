import {expect} from 'chai';
import {devTracks, excerptSeconds, freeHeldoutRefusal, isFreeSet, tierOf} from '../../../benchmark/lib/free-mixes-rows';

function row(id: string, split: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id,
    kind: 'real',
    split,
    artistKey: `artist-${id}`,
    genreFamily: 'electronic',
    licence: 'CC-BY-4.0',
    bpm: 174,
    confidence: 'trackers-all',
    audioPath: `/data/${id}.mp3`,
    labelProvenance: {octaveSplit: false, halvesAgree: true},
    ...extra,
  });
}

const splitIds = JSON.stringify({seed: 's', dev: ['a', 'b', 'c', 'd', 'e'], heldout: ['h']});

describe('RBA-59 free mixes, dev half', () => {
  it('keeps dev rows by tier, with their artist as the group and the excerpt length', () => {
    const manifest = [
      row('a', 'dev'),
      row('b', 'dev', {labelProvenance: {octaveSplit: true, halvesAgree: true}, confidence: 'trackers-two'}),
      row('c', 'dev', {labelProvenance: {octaveSplit: false, halvesAgree: false}}),
      row('d', 'dev', {bpm: null, confidence: 'unresolved'}),
      row('e', 'dev', {kind: 'derived'}),
      '',
    ].join('\n');
    const tracks = devTracks(splitIds, manifest);

    expect(tracks['free-mixes'].map(({id}) => id)).to.deep.equal(['a']);
    expect(tracks['free-mixes-contested'].map(({id}) => id)).to.deep.equal(['b', 'c']);
    expect(tracks['free-mixes'][0]).to.include({set: 'free-mixes', group: 'artist-a', bpm: 174, label: 'trackers-all', excerptSeconds});
    expect(tracks['free-mixes-contested'][0].label).to.equal('trackers-two');
  });

  it('never parses a held-out line, even a broken one', () => {
    const manifest = [row('a', 'dev'), '{"id":"h", not json at all'].join('\n');

    expect(devTracks(splitIds, manifest)['free-mixes']).to.have.length(1);
  });

  it('refuses a row whose own split contradicts the dev list', () => {
    expect(() => devTracks(splitIds, row('a', 'heldout'))).to.throw('heldout');
  });

  it('refuses a line it cannot place without parsing it', () => {
    expect(() => devTracks(splitIds, '{"kind":"real","id":"a"}')).to.throw('does not start with its id');
  });

  it('tiers a label as RBA-59 settles it', () => {
    expect(tierOf({bpm: null, labelProvenance: {}})).to.equal(null);
    expect(tierOf({bpm: 170, labelProvenance: {halvesAgree: null}})).to.equal('free-mixes');
    expect(tierOf({bpm: 170, labelProvenance: {octaveSplit: true}})).to.equal('free-mixes-contested');
  });

  it('names only its own sets', () => {
    expect(isFreeSet('free-mixes')).to.equal(true);
    expect(isFreeSet('fsld')).to.equal(false);
  });

  // run.ts and job.ts both apply this before logging or reading anything
  describe('the held-out refusal', () => {
    it('refuses a held-out run naming a free set, alone or beside other sets', () => {
      expect(freeHeldoutRefusal('heldout', ['free-mixes'])).to.include('dev only');
      expect(freeHeldoutRefusal('heldout', ['free-mixes-contested'])).to.include('dev only');
      expect(freeHeldoutRefusal('heldout', ['fsld', 'free-mixes'])).to.include('dev only');
    });

    it('lets dev read the free sets, and a held-out run without them start', () => {
      expect(freeHeldoutRefusal('dev', ['free-mixes', 'free-mixes-contested'])).to.equal(null);
      expect(freeHeldoutRefusal('heldout', ['fsld', 'groove'])).to.equal(null);
    });
  });
});
