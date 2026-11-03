import {expect} from 'chai';
import {hintVerdict, keyConsensus, normaliseKey, pickForConfirmation, relationOf, tempoConsensus} from '../../../benchmark/free-data/consensus';
import {artistGroups, artistKeyOf, dropDuplicates, extendFreeze, freezeByArtist, placeRows, placementOrder, recordFirstPlaced, rowProblems} from '../../../benchmark/free-data/manifest';
import type {ManifestRow} from '../../../benchmark/free-data/manifest';
import {bandOf, buildReport, calibrate, standingStops, withoutFetchStops} from '../../../benchmark/free-data/report';

const vote = (bpm: number | null, method = 'm') => ({method, bpm});

function row(overrides: Partial<ManifestRow> = {}): ManifestRow {
  return {
    id: 'a',
    kind: 'real',
    source: 'fma',
    url: 'u',
    artist: 'A',
    artistKey: 'a',
    title: 't',
    licence: 'CC-BY-4.0',
    licenceClass: 'permissive',
    licenceEvidence: 'e',
    attribution: 'x',
    sha256: 'h',
    durationSeconds: 200,
    genre: 'g',
    genreFamily: 'electronic',
    bpm: 170,
    key: null,
    confidence: 'trackers-all',
    labelProvenance: {method: 'm', votes: [], hintBpm: null},
    sourceItems: [],
    split: 'dev',
    audioPath: 'p',
    ...overrides,
  };
}

describe('free data: labels', () => {
  describe('tempoConsensus', () => {
    it('labels when every tracker agrees', () => {
      expect(tempoConsensus([vote(170), vote(171), vote(172)])).to.deep.equal({bpm: 171, confidence: 'trackers-all', octaveSplit: false, candidateBpm: null});
    });

    it('labels on two of three, and flags the third when it sits an octave off', () => {
      const result = tempoConsensus([vote(174), vote(87), vote(172)]);

      expect(result.bpm).to.equal(173);
      expect(result.confidence).to.equal('trackers-two');
      expect(result.octaveSplit).to.equal(true);
    });

    it('gives no label when nothing agrees, and offers the first tracker\'s reading only as a candidate', () => {
      expect(tempoConsensus([vote(176), vote(87), vote(117)])).to.deep.equal({bpm: null, confidence: 'unresolved', octaveSplit: true, candidateBpm: 176});
    });

    it('does not let two votes for the lower octave outvote the higher one', () => {
      expect(tempoConsensus([vote(178), vote(89), vote(89)])).to.deep.equal({bpm: null, confidence: 'unresolved', octaveSplit: true, candidateBpm: 178});
    });

    it('survives a tracker that read nothing', () => {
      expect(tempoConsensus([vote(null), vote(170), vote(171)]).bpm).to.equal(170.5);
      expect(tempoConsensus([vote(null), vote(null), vote(null)]).candidateBpm).to.equal(null);
    });
  });

  it('keeps half and double apart when judging a hint', () => {
    expect(relationOf(85, 170)).to.equal('half');
    expect(relationOf(340, 170)).to.equal('double');
    expect(relationOf(166, 170)).to.equal('same');
    expect(hintVerdict(85, 170)).to.equal('half');
    expect(hintVerdict(null, 170)).to.equal('no-hint');
    expect(hintVerdict(85, null)).to.equal('no-label');
  });

  it('compares keys in one spelling and needs every reading to agree', () => {
    expect(normaliseKey('Bb min')).to.equal('A# minor');
    expect(normaliseKey('F#')).to.equal('F# major');
    expect(normaliseKey('c min')).to.equal('C minor');
    expect(normaliseKey('none')).to.equal(null);
    expect(keyConsensus(['A# minor', 'Bb minor'])).to.equal('A# minor');
    expect(keyConsensus(['A minor', 'C major'])).to.equal(null);
    expect(keyConsensus(['A minor'])).to.equal(null);
  });

  describe('pickForConfirmation', () => {
    const rows = Array.from({length: 100}, (_, i) => ({
      id: `t${i}`,
      confidence: i < 40 ? 'unresolved' as const : 'trackers-all' as const,
      octaveSplit: false,
      band: i < 10 ? '165+' : 'under-140',
    }));

    it('takes a fixed random sample, then the open cases, fast ones first and capped', () => {
      const picks = pickForConfirmation(rows, 's', 10, 12);
      const open = picks.filter(pick => pick.why === 'disagreement');

      expect(picks.filter(pick => pick.why === 'random')).to.have.length(10);
      expect(open).to.have.length(12);
      expect(new Set(picks.map(pick => pick.id)).size).to.equal(22);
      expect(Number(open[0].id.slice(1))).to.be.lessThan(10);
    });

    it('draws the same tracks whatever order they come in', () => {
      expect(pickForConfirmation([...rows].reverse(), 's', 10, 0)).to.deep.equal(pickForConfirmation(rows, 's', 10, 0));
    });
  });

  describe('artistKeyOf', () => {
    it('folds spelling and guests into one artist', () => {
      expect(artistKeyOf('Björk feat. Someone')).to.equal(artistKeyOf(' BJORK '));
    });

    it('refuses a name that says nothing about who made the track', () => {
      for (const name of ['Various Artists', 'unknown', '', '...']) {
        expect(artistKeyOf(name)).to.equal(null);
      }
    });
  });

  describe('rowProblems', () => {
    it('passes a good row', () => {
      expect(rowProblems(row())).to.deep.equal([]);
    });

    it('refuses made audio in held-out, however it was made', () => {
      for (const kind of ['derived', 'loop-mix', 'generated'] as const) {
        expect(rowProblems(row({kind, split: 'heldout', sourceItems: ['x']}))).to.deep.equal([`${kind} audio in held-out`]);
      }
    });

    it('refuses a mix or derivative with no source, a missing licence, and a tempo on an unresolved row', () => {
      expect(rowProblems(row({kind: 'derived'}))).to.deep.equal(['derived audio names no source']);
      expect(rowProblems(row({licence: ''}))).to.deep.equal(['no licence']);
      expect(rowProblems(row({confidence: 'unresolved'}))).to.deep.equal(['a tempo on an unresolved row']);
    });
  });

  it('keeps an artist on one side of the split', () => {
    const rows = Array.from({length: 200}, (_, i) => ({id: `t${i}`, artistKey: `artist${i % 40}`, genreFamily: 'electronic' as const}));
    const split = freezeByArtist(rows, 's');
    const sides = new Map<string, Set<string>>();

    for (const item of rows) {
      sides.set(item.artistKey, (sides.get(item.artistKey) ?? new Set()).add(split.get(item.id) ?? ''));
    }

    expect([...sides.values()].every(side => side.size === 1)).to.equal(true);
    expect(new Set([...split.values()]).size).to.equal(2);
  });

  describe('artistGroups', () => {
    const linked = (artist: string, artistKey: string, contentKeys: string[] = []) => ({artist, artistKey, contentKeys});

    it('links two names on the same audio', () => {
      const groups = artistGroups([linked('A', 'a', ['h']), linked('B', 'b', ['h']), linked('C', 'c', ['x'])]);

      expect(groups.get('a')).to.equal(groups.get('b'));
      expect(groups.get('c')).to.not.equal(groups.get('a'));
    });

    it('links a collaboration to its members, when they are artists of the set', () => {
      const groups = artistGroups([linked('Alpha & Beta', 'alphabeta'), linked('Alpha', 'alpha'), linked('Gamma', 'gamma')]);

      expect(groups.get('alphabeta')).to.equal(groups.get('alpha'));
      expect(groups.get('gamma')).to.equal('gamma');
    });

    it('names a group the same whatever order the rows come in', () => {
      const rows = [linked('A', 'a', ['h']), linked('B', 'b', ['h']), linked('C', 'c', ['h'])];

      expect([...artistGroups(rows).values()]).to.deep.equal(['a', 'a', 'a']);
      expect(artistGroups([...rows].reverse()).get('c')).to.equal('a');
    });
  });

  describe('extendFreeze', () => {
    const tracks = (count: number, prefix = 'artist') => Array.from({length: count}, (_, i) => ({id: `${prefix}${i}`, artistKey: `${prefix}${i}`, genreFamily: 'electronic' as const}));
    const none = new Map<string, string>();

    it('never moves an artist, whatever joins later', () => {
      const first = extendFreeze(tracks(60), none, {seed: 's', artists: {}}).frozen;
      const second = extendFreeze([...tracks(60), ...tracks(60, 'new')], none, first).frozen;

      for (const [artist, side] of Object.entries(first.artists)) {
        expect(second.artists[artist]).to.equal(side);
      }

      expect(Object.keys(second.artists)).to.have.length(120);
    });

    it('puts a new artist on the side of one linked to it', () => {
      const frozen = {seed: 's', artists: {old: 'heldout' as const}};
      const result = extendFreeze([{id: 'x', artistKey: 'new', genreFamily: 'electronic'}], new Map([['new', 'old'], ['old', 'old']]), frozen);

      expect(result.frozen.artists.new).to.equal('heldout');
    });

    it('places no track of a group that now spans both sides', () => {
      const frozen = {seed: 's', artists: {a: 'dev' as const, b: 'heldout' as const}};
      const result = extendFreeze([{id: 'x', artistKey: 'c', genreFamily: 'electronic'}], new Map([['a', 'a'], ['b', 'a'], ['c', 'a']]), frozen);

      expect([...result.conflicted]).to.deep.equal(['a']);
      expect(result.frozen.artists.c).to.equal(undefined);
    });
  });

  it('keeps one copy of a recording, by any of its keys', () => {
    const {kept, dropped} = dropDuplicates([
      {id: 'b', contentKeys: ['h2', 'r1']},
      {id: 'a', contentKeys: ['h1', 'r1']},
      {id: 'c', contentKeys: ['h3', 'r3']},
    ]);

    expect(kept.map(item => item.id)).to.deep.equal(['a', 'c']);
    expect(dropped.get('b')).to.equal('a');
  });

  // RBA-59 cap2: 196 tracks of the frozen set left because a new copy sorted first, or chained them to one
  it('keeps the copy an earlier run placed, even when a new copy sorts first', () => {
    const {kept, dropped} = dropDuplicates([
      {id: 'a-new', contentKeys: ['h1', 'r2']},
      {id: 'b-old', contentKeys: ['h3', 'r2']},
      {id: 'c-old', contentKeys: ['h1', 'r4']},
    ], placementOrder(new Set(['b-old', 'c-old']), new Map(), new Map()));

    expect(kept.map(item => item.id)).to.deep.equal(['b-old', 'c-old']);
    expect(dropped.get('a-new')).to.equal('c-old');
  });

  // RBA-59 reconsolidate: the union of two runs' split-ids held both copies of 186 recordings, and the later copy won by id
  it('keeps the copy placed first when an earlier and a later run both placed a copy', () => {
    const order = placementOrder(new Set(['a-cap2', 'z-before']), new Map(), new Map([['z-before', 10], ['a-cap2', 900]]));
    const {kept, dropped} = dropDuplicates([
      {id: 'a-cap2', contentKeys: ['h1', 'r1']},
      {id: 'z-before', contentKeys: ['h2', 'r1']},
    ], order);

    expect(kept.map(item => item.id)).to.deep.equal(['z-before']);
    expect(dropped.get('a-cap2')).to.equal('z-before');
  });

  describe('placementOrder', () => {
    it('ranks an id with no record first, then by the run that placed it, then by fetch, then by id', () => {
      const order = placementOrder(
        new Set(['late-run', 'early-run', 'old-fetched-late', 'old-fetched-early', 'old-never-fetched-b', 'old-never-fetched-a']),
        new Map([['late-run', '2026-12-01T00:00:00.000Z'], ['early-run', '2026-11-04T00:00:00.000Z']]),
        new Map([['early-run', 1], ['late-run', 0], ['old-fetched-late', 50], ['old-fetched-early', 5]]),
      );

      expect([...order.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id)).to.deep.equal([
        'old-fetched-early', 'old-fetched-late', 'old-never-fetched-a', 'old-never-fetched-b', 'early-run', 'late-run',
      ]);
    });

    it('ranks only the ids placed before', () => {
      expect([...placementOrder(new Set(['a']), new Map([['b', '2026-11-04']]), new Map([['c', 0]])).keys()]).to.deep.equal(['a']);
    });
  });

  describe('recordFirstPlaced', () => {
    it('stamps only new placements, and never moves a stamp', () => {
      const record = recordFirstPlaced(
        {kept: '2026-11-04T00:00:00.000Z', left: '2026-11-04T00:00:00.000Z'},
        ['kept', 'old-unrecorded', 'new'],
        new Set(['kept', 'old-unrecorded']),
        '2026-12-01T00:00:00.000Z',
      );

      expect(record).to.deep.equal({kept: '2026-11-04T00:00:00.000Z', left: '2026-11-04T00:00:00.000Z', new: '2026-12-01T00:00:00.000Z'});
    });

    it('keeps the first stamp of an id that left and comes back as new', () => {
      const record = recordFirstPlaced({back: '2026-11-04T00:00:00.000Z'}, ['back'], new Set(), '2026-12-01T00:00:00.000Z');

      expect(record.back).to.equal('2026-11-04T00:00:00.000Z');
    });
  });

  describe('placeRows', () => {
    const groups = new Map([['a', 'a'], ['b', 'a'], ['c', 'a'], ['d', 'd']]);

    // RBA-59 cap2: 317 tracks of the frozen set left because new rows linked their artists across the split
    it('keeps a placed row on its side when new rows link its group across the split, and refuses the new ones', () => {
      const {placed, refused} = placeRows([
        {id: 'old-a', artistKey: 'a'},
        {id: 'old-b', artistKey: 'b'},
        {id: 'new-c', artistKey: 'c'},
        {id: 'new-a', artistKey: 'a'},
        {id: 'new-d', artistKey: 'd'},
      ], groups, new Set(['a']), new Set(['old-a', 'old-b']));

      expect(placed.map(row => row.id)).to.deep.equal(['old-a', 'old-b', 'new-d']);
      expect(refused.map(row => row.id)).to.deep.equal(['new-c', 'new-a']);
    });
  });

  it('forgets the stops of an earlier fetch, which a new fetch starts over, and keeps the catalogue ones', () => {
    expect(withoutFetchStops([
      {stop: 'internet archive, techno: stopped at the page limit, more items exist'},
      {stop: 'internet-archive: stopped at the disk limit'},
      {stop: 'fma: refused 5 in a row, queue stopped: HTTP 429'},
      {stop: 'fma: stopped at the disk limit', stage: 'fetch'},
    ])).to.deep.equal([{stop: 'internet archive, techno: stopped at the page limit, more items exist'}]);
  });

  describe('standingStops', () => {
    const stops = [
      {stop: 'internet archive, techno: stopped at the page limit, more items exist'},
      {stop: 'internet-archive: stopped at the disk limit'},
      {stop: 'fma: stopped at the disk limit', stage: 'fetch' as const},
      {stop: 'fma: refused 5 in a row, queue stopped: HTTP 429', stage: 'fetch' as const},
    ];

    // RBA-59 reconsolidate: the 150 GiB stop stayed in the report after the cap went to 1 TiB, as no fetch ran since
    it('drops a disk-limit stop once the cap is above what is fetched, with no fetch since', () => {
      expect(standingStops(stops, {fetchedBytes: 268e9, mostBytes: 1024 ** 4, unfetched: 543}).map(row => row.stop)).to.deep.equal([
        'internet archive, techno: stopped at the page limit, more items exist',
        'fma: refused 5 in a row, queue stopped: HTTP 429',
      ]);
    });

    it('keeps a disk-limit stop while the set is over its cap with work left', () => {
      expect(standingStops(stops, {fetchedBytes: 170e9, mostBytes: 150 * 1024 ** 3, unfetched: 9400})).to.deep.equal(stops);
    });

    it('drops a disk-limit stop when nothing is left to fetch', () => {
      expect(standingStops(stops, {fetchedBytes: 170e9, mostBytes: 150 * 1024 ** 3, unfetched: 0})).to.have.length(2);
    });
  });

  describe('buildReport', () => {
    it('puts the bands where the card does', () => {
      expect([bandOf(139.9), bandOf(140), bandOf(164.9), bandOf(165), bandOf(null)]).to.deep.equal(['under-140', '140-165', '140-165', '165+', 'no-label']);
    });

    it('meets the target only with real, permissive, settled labels', () => {
      const settled = Array.from({length: 200}, (_, i) => row({id: `s${i}`, artistKey: `a${i % 50}`}));
      const report = buildReport([
        ...settled,
        row({id: 'sa', licenceClass: 'share-alike'}),
        row({id: 'contested', labelProvenance: {method: 'm', votes: [], hintBpm: null, octaveSplit: true}}),
        row({id: 'open', bpm: null, confidence: 'unresolved', labelProvenance: {method: 'm', votes: [], hintBpm: null, candidateBpm: 172}}),
        row({id: 'made', kind: 'generated'}),
        row({id: 'stretched', kind: 'derived', sourceItems: ['x']}),
      ]);

      expect(report.verdict['165+']).to.deep.equal({met: true, have: 200, otherGenres: 0, short: 0, artists: 50, contested: 1, awaitingPerson: 1});
      expect(report.verdict['140-165']).to.deep.include({met: false, short: 200});
      expect(report.real.bands['165+'].shareAlike).to.equal(1);
      expect(report.notReal.generated?.tracks).to.equal(1);
      expect(report.notReal.derived?.tracks).to.equal(1);
    });

    it('does not let another genre meet a target set for electronic music', () => {
      const {verdict} = buildReport(Array.from({length: 300}, (_, i) => row({id: `p${i}`, genreFamily: 'fast-rock'})));

      expect(verdict['165+']).to.deep.include({met: false, have: 0, otherGenres: 300});
    });

    it('counts a track whose tempo moves as contested', () => {
      const {verdict} = buildReport([row({labelProvenance: {method: 'm', votes: [], hintBpm: null, halvesAgree: false}})]);

      expect(verdict['165+']).to.deep.include({have: 0, contested: 1});
    });

    it('calibrates each tracker on exact tempos, half and double apart', () => {
      const votes = new Map([['a', [vote(170, 'x'), vote(85, 'y'), vote(null, 'z')]], ['b', [vote(340, 'x')]]]);

      expect(calibrate([row({id: 'a'}), row({id: 'b'}), row({id: 'unread'})], votes)).to.deep.equal({
        x: {tracks: 2, same: 1, half: 0, double: 1, other: 0, none: 0},
        y: {tracks: 1, same: 0, half: 1, double: 0, other: 0, none: 0},
        z: {tracks: 1, same: 0, half: 0, double: 0, other: 0, none: 1},
      });
    });

    it('does not let a generated track fill a thin band', () => {
      const report = buildReport(Array.from({length: 500}, (_, i) => row({id: `g${i}`, kind: 'generated'})));

      expect(report.verdict['165+'].have).to.equal(0);
      expect(report.real.tracks).to.equal(0);
    });

    it('reports hints half and double apart, per source', () => {
      const hinted = (id: string, hintBpm: number) => row({id, labelProvenance: {method: 'm', votes: [], hintBpm}});
      const {wrongHintRate, hints, hintsBySource} = buildReport([hinted('a', 85), hinted('b', 340), hinted('c', 170), hinted('d', 120)]).real;

      expect(hints).to.deep.include({half: 1, double: 1, same: 1, other: 1});
      expect(wrongHintRate).to.deep.equal({checked: 4, half: 0.25, double: 0.25, other: 0.25});
      expect(hintsBySource.fma.half).to.equal(1);
    });
  });
});
