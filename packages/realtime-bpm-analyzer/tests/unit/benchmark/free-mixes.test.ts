import {expect} from 'chai';
import {freeLookDetectors, freeLookSets} from '../../../benchmark/lib/free-look';
import {devTracks, excerptSeconds, freeHeldoutRefusal, freeJobModeRefusal, freeLookScope, isFreeSet, splitTracks, tierOf} from '../../../benchmark/lib/free-mixes-rows';

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

  // run.ts and job.ts both apply these before logging or reading anything
  describe('the held-out refusal', () => {
    const look = ['peaks', 'tempogram'];

    it('refuses a held-out run on a free set that is not the whole look', () => {
      expect(freeHeldoutRefusal('heldout', ['free-mixes'], look)).to.include('one look');
      expect(freeHeldoutRefusal('heldout', ['free-mixes-contested'], look)).to.include('one look');
      expect(freeHeldoutRefusal('heldout', ['fsld', 'free-mixes', 'free-mixes-contested'], look)).to.include('one look');
      expect(freeHeldoutRefusal('heldout', ['free-mixes', 'free-mixes-contested'], ['tempogram'])).to.include('one look');
      expect(freeHeldoutRefusal('heldout', ['free-mixes', 'free-mixes-contested'], [...look, 'tempogram-ridge-50-90-180'])).to.include('one look');
    });

    it('lets the whole look through, in any order, and dev and the clean sets as before', () => {
      expect(freeHeldoutRefusal('heldout', ['free-mixes-contested', 'free-mixes'], ['tempogram', 'peaks'])).to.equal(null);
      expect(freeHeldoutRefusal('dev', ['free-mixes', 'free-mixes-contested'], ['tempogram-ridge-50-90-180'])).to.equal(null);
      expect(freeHeldoutRefusal('heldout', ['fsld', 'groove'], ['peaks'])).to.equal(null);
    });

    it('keeps the free sets out of the job\'s heldout mode, which has the clean sets\' budget', () => {
      expect(freeJobModeRefusal('heldout', ['fsld', 'free-mixes'])).to.include('free-look');
      expect(freeJobModeRefusal('heldout', ['fsld', 'groove'])).to.equal(null);
      expect(freeJobModeRefusal('dev', ['free-mixes'])).to.equal(null);
    });

    it('names the look as the verdict judges it', () => {
      expect(freeLookScope.detectors).to.have.members([...freeLookDetectors]);
      expect(freeLookScope.sets).to.have.members([...freeLookSets]);
    });
  });

  describe('the held-out half, for the look only', () => {
    it('reads held-out ids and never parses a dev line', () => {
      const manifest = [row('h', 'heldout'), '{"id":"a", not json at all'].join('\n');

      expect(splitTracks('heldout', splitIds, manifest)['free-mixes'].map(({id}) => id)).to.deep.equal(['h']);
    });

    it('refuses a held-out id whose row says dev, and a split list with no such half', () => {
      expect(() => splitTracks('heldout', splitIds, row('h', 'dev'))).to.throw('heldout list');
      expect(() => splitTracks('heldout', JSON.stringify({dev: ['a']}), row('a', 'dev'))).to.throw('no heldout ids');
    });
  });
});
