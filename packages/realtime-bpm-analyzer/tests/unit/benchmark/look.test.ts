import {expect} from 'chai';
import {UndecodableTrack, assertDecoded, lookHeader, lookDetectorRefusal, lookRefusal, lookScopeRefusal, progressRows, refusalOf, resumesLook, skippedTracks, undecodableLimit} from '../../../benchmark/lib/look';
import type {RunFailure} from '../../../benchmark/lib/look';

const row = (id: string) => `\n${JSON.stringify({detector: 'peaks', result: {id}})}\n`;

describe('benchmark held-out looks', () => {
  it('starts a new look when no progress exists, so deleting the files logs again', () => {
    expect(resumesLook('', 'look a')).to.equal(false);
  });

  it('resumes only the look its progress file names', () => {
    const progress = lookHeader('look a') + row('1');

    expect(resumesLook(progress, 'look a')).to.equal(true);
    expect(() => resumesLook(progress, 'look b')).to.throw('another look');
  });

  it('refuses results that name no look, since they would score unlogged', () => {
    expect(() => resumesLook(row('1'), 'look a')).to.throw('another look');
  });

  it('keeps results and drops the header and a torn last line', () => {
    const rows = progressRows<{result: {id: string}}>(`${lookHeader('look a')}${row('1')}${row('2')}{"detector":"pe`);

    expect(rows.map(({result}) => result.id)).to.deep.equal(['1', '2']);
  });

  describe('a track that cannot decode', () => {
    const undecodable = (id: string): RunFailure => ({set: 'fsld', id, reason: 'no samples', undecodable: true});

    it('calls a file with a valid header and no samples undecodable, even when ffmpeg exits 0', () => {
      expect(() => {
        assertDecoded('a.wav', 0, 0, '');
      }).to.throw(UndecodableTrack, 'a.wav');
    });

    it('calls a failing ffmpeg undecodable and keeps what it said', () => {
      expect(() => {
        assertDecoded('a.wav', null, 0, '');
      }).to.throw().and.not.be.instanceOf(UndecodableTrack);

      expect(() => {
        assertDecoded('a.wav', 1, 0, 'Invalid data\n');
      }).to.throw(UndecodableTrack, 'Invalid data');
    });

    it('passes a file that gave samples', () => {
      expect(() => {
        assertDecoded('a.wav', 0, 4, '');
      }).to.not.throw();
    });

    it('counts a track once however many detectors failed on it, and lets the run close', () => {
      const failures = [undecodable('1'), undecodable('1'), undecodable('1')];

      expect(skippedTracks(failures).map(({id}) => id)).to.deep.equal(['1']);
      expect(refusalOf(failures)).to.equal(null);
    });

    it('lets the run close at the limit and refuses it just past', () => {
      const tracks = (count: number) => Array.from({length: count}, (_, i) => undecodable(String(i)));

      expect(refusalOf(tracks(undecodableLimit))).to.equal(null);
      expect(refusalOf(tracks(undecodableLimit + 1))).to.contain('over the limit');
    });

    it('never skips a run that failed for another reason, however few', () => {
      const failures = [{set: 'fsld', id: '1', reason: 'detector threw', undecodable: false}];

      expect(refusalOf(failures)).to.contain('detector threw');
      expect(skippedTracks(failures)).to.deep.equal([]);
    });

    it('refuses other failures even with undecodable tracks beside them', () => {
      expect(refusalOf([undecodable('1'), {set: 'groove', id: '2', reason: 'boom', undecodable: false}])).to.contain('groove/2');
    });

    it('has a clean run close with nothing to report', () => {
      expect(refusalOf([])).to.equal(null);
      expect(skippedTracks([])).to.deep.equal([]);
    });
  });

  describe('the budget of looks', () => {
    const line = '| 2026-10-31T15:07:11.550Z | abc | peaks | why |\n';

    it('lets the first look start without saying anything more', () => {
      expect(lookRefusal('', false, 'final score')).to.equal(null);
    });

    it('refuses a look after the first unless it declares itself a second look', () => {
      expect(lookRefusal(line, false, 'final score')).to.contain('Second look');
      expect(lookRefusal(line, false, 'Second look, prompted by the first, rule amended')).to.equal(null);
      expect(lookRefusal(line, false, 'Second look, prompted by the first')).to.contain('amended');
      expect(lookRefusal(line, false, 'not a second look, prompted by the first')).to.contain('Second look');
      expect(lookRefusal(line, false, 'Second look')).to.contain('prompted');
    });

    it('refuses a third look, whatever its reason and whatever commit asks', () => {
      expect(lookRefusal(line + line, false, 'Second look, prompted by the first')).to.contain('limit');
    });

    it('refuses a look with no pick, or at a candidate beside the pick', () => {
      expect(lookDetectorRefusal(null, ['peaks'], ['peaks'])).to.contain('No pick');
      expect(lookDetectorRefusal('a', ['a', 'b'], ['a', 'peaks'])).to.contain('b');
      expect(lookDetectorRefusal('a', ['a', 'peaks'], ['a', 'peaks'])).to.equal(null);
    });

    it('refuses a narrowed look, which could get no verdict', () => {
      expect(lookScopeRefusal(['a', 'b'], ['x', 'y'], ['b', 'a'], ['y', 'x'])).to.equal(null);
      expect(lookScopeRefusal(['a'], ['x', 'y'], ['a', 'b'], ['x', 'y'])).to.contain('no less');
      expect(lookScopeRefusal(['a', 'b'], ['x'], ['a', 'b'], ['x', 'y'])).to.contain('no less');
      expect(lookScopeRefusal(['a', 'a'], ['x', 'y'], ['a', 'b'], ['x', 'y'])).to.contain('no less');
    });

    it('lets the second look resume after a kill, which spends nothing', () => {
      expect(lookRefusal(line + line, true, 'second look')).to.equal(null);
    });
  });
});
