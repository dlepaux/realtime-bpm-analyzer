import {hintVerdict} from './consensus';
import type {HintVerdict} from './consensus';
import type {ManifestRow, TrackKind} from './manifest';

/** The card's bands, and its target: at least this many real tracks per band */
export const target = 200;

export type Band = 'under-140' | '140-165' | '165+' | 'no-label';

export function bandOf(bpm: number | null): Band {
  if (bpm === null) {
    return 'no-label';
  }

  if (bpm < 140) {
    return 'under-140';
  }

  return bpm < 165 ? '140-165' : '165+';
}


export type BandCount = {
  readonly tracks: number;
  readonly artists: number;
  /** Permissive only: share-alike is an open question for weights, so it never fills the target */
  readonly permissive: number;
  readonly shareAlike: number;
  readonly permissiveArtists: number;
  readonly electronicPermissive: number;
  readonly electronicArtists: number;
};

function bandCount(rows: readonly ManifestRow[]): BandCount {
  const artists = (list: readonly ManifestRow[]) => new Set(list.map(row => row.artistKey)).size;
  const permissive = rows.filter(row => row.licenceClass === 'permissive');
  const electronic = permissive.filter(row => row.genreFamily === 'electronic');

  return {
    tracks: rows.length,
    artists: artists(rows),
    permissive: permissive.length,
    shareAlike: rows.length - permissive.length,
    permissiveArtists: artists(permissive),
    electronicPermissive: electronic.length,
    electronicArtists: artists(electronic),
  };
}

function tally(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }

  return counts;
}

export type BandVerdict = {
  readonly met: boolean;
  /** Real, permissive, labelled, and no tracker dissenting by an octave. Only these meet the target */
  readonly have: number;
  readonly short: number;
  readonly artists: number;
  /** Labelled by two trackers while the third sits an octave away: a person should settle these */
  readonly contested: number;
  /** No label, and the first tracker reads this band: what a person's confirmation could still add */
  readonly awaitingPerson: number;
};

export type DataReport = {
  readonly real: {
    readonly tracks: number;
    readonly artists: number;
    readonly bySource: Record<string, number>;
    readonly byLicence: Record<string, number>;
    readonly byGenreFamily: Record<string, number>;
    readonly byConfidence: Record<string, number>;
    readonly bands: Record<Band, BandCount>;
    readonly bandsBySource: Record<string, Partial<Record<Band, number>>>;
    readonly splits: Record<string, {readonly tracks: number; readonly artists: number; readonly bands: Partial<Record<Band, number>>}>;
    readonly agreement: {readonly all: number; readonly two: number; readonly none: number; readonly octaveSplits: number};
    readonly hints: Record<HintVerdict, number>;
    /** Hints differ in kind per host: an uploader's number is not an old detector's */
    readonly hintsBySource: Record<string, Record<string, number>>;
    readonly wrongHintRate: {readonly checked: number; readonly half: number; readonly double: number; readonly other: number} | null;
  };
  /** Apart on purpose: none of this counts towards the target */
  readonly notReal: Partial<Record<TrackKind, {readonly tracks: number; readonly bands: Partial<Record<Band, number>>}>>;
  readonly verdict: Record<'140-165' | '165+', BandVerdict>;
};

function bandsOf(rows: readonly ManifestRow[]): Partial<Record<Band, number>> {
  return tally(rows.map(row => bandOf(row.bpm)));
}

/**
 * Every count the card asks for. The verdict counts only real tracks under a permissive licence with
 * a label: an octave split is not settled, and a share-alike track may not survive RBA-40.
 * @param rows The manifest
 * @returns The report
 */
export function buildReport(rows: readonly ManifestRow[]): DataReport {
  const real = rows.filter(row => row.kind === 'real');
  const bands = (['under-140', '140-165', '165+', 'no-label'] as const);
  const hints = real.map(row => hintVerdict(row.labelProvenance.hintBpm, row.bpm));
  const checked = hints.filter(hint => hint === 'same' || hint === 'half' || hint === 'double' || hint === 'other');
  const share = (verdict: HintVerdict) => hints.filter(hint => hint === verdict).length / checked.length;
  const verdictOf = (band: '140-165' | '165+') => {
    const permissive = real.filter(row => row.licenceClass === 'permissive');
    const inBand = permissive.filter(row => bandOf(row.bpm) === band);
    const settled = inBand.filter(row => !row.labelProvenance.octaveSplit);
    const have = settled.length;

    return {
      met: have >= target,
      have,
      short: Math.max(0, target - have),
      artists: new Set(settled.map(row => row.artistKey)).size,
      contested: inBand.length - have,
      awaitingPerson: permissive.filter(row => row.bpm === null && bandOf(row.labelProvenance.candidateBpm ?? null) === band).length,
    };
  };
  const notReal: DataReport['notReal'] = {};

  for (const kind of ['loop', 'derived', 'loop-mix', 'generated'] as const) {
    const ofKind = rows.filter(row => row.kind === kind);

    if (ofKind.length > 0) {
      notReal[kind] = {tracks: ofKind.length, bands: bandsOf(ofKind)};
    }
  }

  return {
    real: {
      tracks: real.length,
      artists: new Set(real.map(row => row.artistKey)).size,
      bySource: tally(real.map(row => row.source)),
      byLicence: tally(real.map(row => row.licence)),
      byGenreFamily: tally(real.map(row => row.genreFamily)),
      byConfidence: tally(real.map(row => row.confidence)),
      bands: Object.fromEntries(bands.map(band => [band, bandCount(real.filter(row => bandOf(row.bpm) === band))])) as Record<Band, BandCount>,
      bandsBySource: Object.fromEntries([...new Set(real.map(row => row.source))].map(source => [source, bandsOf(real.filter(row => row.source === source))])),
      splits: Object.fromEntries(['dev', 'heldout'].map(split => {
        const side = real.filter(row => row.split === split);

        return [split, {tracks: side.length, artists: new Set(side.map(row => row.artistKey)).size, bands: bandsOf(side)}];
      })),
      agreement: {
        all: real.filter(row => row.confidence === 'trackers-all').length,
        two: real.filter(row => row.confidence === 'trackers-two').length,
        none: real.filter(row => row.confidence === 'unresolved').length,
        octaveSplits: real.filter(row => row.labelProvenance.octaveSplit).length,
      },
      hints: {same: 0, half: 0, double: 0, other: 0, 'no-hint': 0, 'no-label': 0, ...tally(hints)},
      hintsBySource: Object.fromEntries([...new Set(real.map(row => row.source))].map(source => [source, tally(
        real.filter(row => row.source === source).map(row => hintVerdict(row.labelProvenance.hintBpm, row.bpm)),
      )])),
      wrongHintRate: checked.length === 0 ? null : {checked: checked.length, half: share('half'), double: share('double'), other: share('other')},
    },
    notReal,
    verdict: {'140-165': verdictOf('140-165'), '165+': verdictOf('165+')},
  };
}
