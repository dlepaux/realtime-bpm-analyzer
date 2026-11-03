import {expect} from 'chai';
import {classifyLicence, echonestTempos, genreFamilyOf, narrow, parseCsv, parseFma, parseInternetArchive, secondsOf} from '../../../benchmark/free-data/sources';
import type {Candidate, FmaRow, GenreRow, IaItem} from '../../../benchmark/free-data/sources';

const genres = new Map<string, GenreRow>([
  ['181', {genre_id: '181', title: 'Techno', top_level: '15'}],
  ['25', {genre_id: '25', title: 'Punk', top_level: '12'}],
  ['2', {genre_id: '2', title: 'International', top_level: '2'}],
]);

function fma(overrides: Partial<FmaRow> = {}): FmaRow {
  return {
    track_id: '137288',
    artist_name: 'To Eris',
    track_title: 'A',
    license_url: 'http://creativecommons.org/licenses/by/4.0/',
    license_title: 'x',
    track_genres: "[{'genre_id': '181', 'genre_title': 'Techno'}]",
    track_url: 'http://freemusicarchive.org/x',
    track_duration: '05:05',
    ...overrides,
  };
}

function ia(metadata: Partial<IaItem['metadata']>, files: IaItem['files']): IaItem {
  return {metadata: {identifier: 'item', licenseurl: 'https://creativecommons.org/licenses/by/4.0/', creator: 'Maker', subject: 'jungle', ...metadata}, files};
}

describe('free data: what each host says', () => {
  describe('classifyLicence', () => {
    it('takes CC0 and BY as permissive, BY-SA apart, a ported licence with its port', () => {
      expect(classifyLicence('https://creativecommons.org/publicdomain/zero/1.0/')).to.deep.equal({ok: true, spdx: 'CC0-1.0', licenceClass: 'permissive'});
      expect(classifyLicence('http://creativecommons.org/licenses/by/3.0/us/')).to.deep.equal({ok: true, spdx: 'CC-BY-3.0-US', licenceClass: 'permissive'});
      expect(classifyLicence('https://creativecommons.org/licenses/by-sa/4.0/')).to.deep.equal({ok: true, spdx: 'CC-BY-SA-4.0', licenceClass: 'share-alike'});
    });

    for (const url of [
      'http://creativecommons.org/licenses/by-nc/4.0/',
      'http://creativecommons.org/licenses/by-nd/3.0/',
      'http://creativecommons.org/licenses/by-nc-sa/3.0/us/',
      'http://creativecommons.org/publicdomain/mark/1.0/',
      'http://creativecommons.org/licenses/publicdomain/',
      'https://evil.example/creativecommons.org/licenses/by/4.0/',
      '',
    ]) {
      it(`refuses "${url}"`, () => {
        expect(classifyLicence(url).ok).to.equal(false);
      });
    }
  });

  it('sorts free-text genres into a family', () => {
    expect(genreFamilyOf('Drum & Bass')).to.equal('electronic');
    expect(genreFamilyOf('grindcore')).to.equal('fast-rock');
    expect(genreFamilyOf('folk')).to.equal('other');
  });

  describe('parseFma', () => {
    it('names the archive member and keeps the licence evidence', () => {
      const parsed = parseFma(fma(), genres, 125);

      if (!parsed.ok) {
        throw new Error(parsed.reason);
      }

      expect(parsed.candidate.audio).to.deep.equal({zipMember: 'fma_full/137/137288.mp3'});
      expect(parsed.candidate.licenceEvidence).to.contain('raw_tracks.csv');
      expect(parsed.candidate.hintBpm).to.equal(125);
      expect(parsed.candidate.statedSeconds).to.equal(305);
    });

    it('pads a short id to the archive path', () => {
      const parsed = parseFma(fma({track_id: '2'}), genres, null);

      expect(parsed.ok && parsed.candidate.audio).to.deep.equal({zipMember: 'fma_full/000/000002.mp3'});
    });

    it('rejects a genre out of scope, an NC licence, and a nameless artist, each with its reason', () => {
      expect(parseFma(fma({track_genres: "[{'genre_id': '2'}]"}), genres, null)).to.deep.equal({ok: false, reason: 'genre out of scope'});
      expect(parseFma(fma({license_url: 'http://creativecommons.org/licenses/by-nc/4.0/'}), genres, null)).to.deep.equal({ok: false, reason: 'licence not permissive'});
      expect(parseFma(fma({artist_name: 'Various Artists'}), genres, null)).to.deep.equal({ok: false, reason: 'no artist'});
      expect(parseFma(fma({track_url: ' '}), genres, null)).to.deep.equal({ok: false, reason: 'no source page'});
    });
  });

  describe('parseInternetArchive', () => {
    it('fetches the Archive\'s own MP3 of a WAV upload, under the original\'s identity', () => {
      const [parsed] = parseInternetArchive(ia({}, [
        {name: 'a b.wav', source: 'original', length: '300'},
        {name: 'a b.mp3', source: 'derivative', original: 'a b.wav'},
      ]));

      if (!parsed.ok) {
        throw new Error(parsed.reason);
      }

      expect(parsed.candidate.audio).to.deep.equal({url: 'https://archive.org/download/item/a%20b.mp3'});
      expect(parsed.candidate.id).to.equal('ia-item-a_b.wav');
      expect(parsed.candidate.statedSeconds).to.equal(300);
    });

    it('never counts a derivative as a track of its own', () => {
      expect(parseInternetArchive(ia({}, [{name: 'a.mp3', source: 'derivative', original: 'a.flac'}]))).to.deep.equal([{ok: false, reason: 'no original audio file'}]);
    });

    it('refuses an item whose own text contradicts its licence field', () => {
      const original = {name: 'a.mp3', source: 'original'};

      expect(parseInternetArchive(ia({description: 'Free to share. All rights reserved.'}, [original]))).to.deep.equal([{ok: false, reason: 'item text contradicts its licence field'}]);
      expect(parseInternetArchive(ia({rights: 'by-nc'}, [original]))[0].ok).to.equal(false);
    });

    it('refuses an unclear licence, and a file with no maker', () => {
      expect(parseInternetArchive(ia({licenseurl: undefined}, [])) ).to.deep.equal([{ok: false, reason: 'no licence'}]);
      expect(parseInternetArchive(ia({creator: 'Various Artists'}, [{name: 'a.mp3', source: 'original'}]))).to.deep.equal([{ok: false, reason: 'no artist'}]);
    });
  });

  it('reads lengths as hosts state them', () => {
    expect(secondsOf('03:20')).to.equal(200);
    expect(secondsOf('1:00:00')).to.equal(3600);
    expect(secondsOf('245.33')).to.be.closeTo(245.33, 0.001);
    expect(secondsOf('')).to.equal(null);
    expect(secondsOf('three minutes')).to.equal(null);
  });

  describe('narrow', () => {
    function candidate(id: string, artistKey: string, statedSeconds: number | null): Candidate {
      return {id, artistKey, statedSeconds} as Candidate;
    }

    it('drops sets and sketches but keeps a track with no stated length, for the measured check', () => {
      const {kept, dropped} = narrow([candidate('a', 'x', 3000), candidate('b', 'x', 10), candidate('c', 'x', null), candidate('d', 'x', 200)], 's', 10);

      expect(kept.map(row => row.id).sort()).to.deep.equal(['c', 'd']);
      expect(dropped['wrong length']).to.equal(2);
    });

    it('caps an artist and leaves the others alone, the same way each time', () => {
      const rows = [...Array.from({length: 20}, (_, i) => candidate(`a${i}`, 'prolific', 200)), candidate('b', 'other', 200)];
      const first = narrow(rows, 's', 5);

      expect(first.kept.filter(row => row.artistKey === 'prolific')).to.have.length(5);
      expect(first.kept.some(row => row.id === 'b')).to.equal(true);
      expect(first.dropped['over the per-artist share']).to.equal(15);
      expect(narrow([...rows].reverse(), 's', 5).kept.map(row => row.id)).to.deep.equal(first.kept.map(row => row.id));
    });
  });

  it('parses quotes, commas and newlines inside a CSV field', () => {
    expect(parseCsv('a,"b,""c""\nd",e\r\n1,2,3')).to.deep.equal([['a', 'b,"c"\nd', 'e'], ['1', '2', '3']]);
    expect(parseCsv('a,\n,b\n')).to.deep.equal([['a', ''], ['', 'b']]);
    expect(parseCsv('"a"\r\n"b",""')).to.deep.equal([['a'], ['b', '']]);
  });

  it('reads the tempo from Echo Nest\'s three-row header, and refuses a changed file', () => {
    const rows = [['', 'echonest', 'echonest'], ['', 'audio_features', 'audio_features'], ['', 'energy', 'tempo'], ['track_id', '', ''], ['2', '0.4', '165.9'], ['3', '0.5', '0']];

    expect([...echonestTempos(rows)]).to.deep.equal([['2', 165.9]]);
    expect(() => echonestTempos([['a'], ['b'], ['c']])).to.throw('changed');
  });
});
