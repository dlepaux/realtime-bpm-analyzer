import {assignSplit} from '../lib/split';
import type {Split, Track} from '../lib/types';

export type LicenceClass = 'permissive' | 'share-alike';

/**
 * Real audio from a host, audio derived from it, or audio this repo generated. Only `real` counts
 * towards the card's target, and only `real` may ever be held out.
 */
export type TrackKind = 'real' | 'loop' | 'derived' | 'loop-mix' | 'generated';

export type TempoVote = {readonly method: string; readonly bpm: number | null};

export type Confidence =
  /** By construction: the code that made the audio chose this tempo */
  | 'exact'
  /** Carried over from a labelled source through a known factor */
  | 'carried'
  /** A person listened */
  | 'human'
  /** Expert annotators of the dataset */
  | 'annotated'
  /** All independent trackers within ±4%, same octave */
  | 'trackers-all'
  /** Two independent trackers within ±4%, the third elsewhere */
  | 'trackers-two'
  /** No two trackers agree in the same octave: no label until a person listens */
  | 'unresolved';

export type ManifestRow = {
  readonly id: string;
  readonly kind: TrackKind;
  readonly source: string;
  readonly url: string;
  readonly artist: string;
  /** Normalised artist: the unit the split keeps together, across sources */
  readonly artistKey: string;
  readonly title: string;
  readonly licence: string;
  readonly licenceClass: LicenceClass;
  /** Where the licence was read, exactly */
  readonly licenceEvidence: string;
  readonly attribution: string;
  readonly sha256: string;
  readonly durationSeconds: number;
  readonly genre: string;
  readonly genreFamily: 'electronic' | 'fast-rock' | 'other';
  readonly bpm: number | null;
  readonly key: string | null;
  readonly confidence: Confidence;
  /** How the label was reached: the votes, and the uploader's hint kept as a hint */
  readonly labelProvenance: {
    readonly method: string;
    readonly votes: readonly TempoVote[];
    readonly hintBpm: number | null;
    readonly keyVotes?: readonly string[];
    /** A tracker sits an octave from another: labelled or not, a person should settle it */
    readonly octaveSplit?: boolean;
    readonly candidateBpm?: number | null;
    /** Beat This!, first half against second. False means a tempo change or a lost tracker */
    readonly halvesAgree?: boolean | null;
  };
  /** Exact structure, when the audio was built from one */
  readonly sections?: ReadonlyArray<{readonly kind: string; readonly startSeconds: number; readonly endSeconds: number}>;
  /** Ids of the items this audio came from. Empty only for `real`, `loop` and `generated` */
  readonly sourceItems: readonly string[];
  readonly split: Split;
  readonly audioPath: string;
};

const various = /^(various|various artists|va|v\.a\.|unknown|unknown artist|n\/a|none|compilation)$/;
const featuring = /\s+(feat\.?|ft\.?|featuring|vs\.?|versus)\s+.*$/i;

/**
 * The unit a split keeps together. Case, accents and punctuation do not make another artist, and a
 * guest does not either.
 * @param artist Name as the source gives it
 * @returns The key, or null when the name says nothing about who made the track
 */
export function artistKeyOf(artist: string): string | null {
  const plain = artist.trim().replace(featuring, '').toLowerCase();

  if (plain === '' || various.test(plain)) {
    return null;
  }

  const key = plain.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');

  return key === '' ? null : key;
}

const required = ['id', 'source', 'url', 'artist', 'artistKey', 'title', 'licence', 'licenceEvidence', 'attribution', 'sha256', 'audioPath'] as const;

/**
 * Everything wrong with a row. A row that reaches the manifest has none: an unclear item is
 * rejected, never repaired by a default.
 * @param row Row to check
 * @returns Problems, empty when the row is fine
 */
export function rowProblems(row: ManifestRow): string[] {
  const problems = required.filter(field => row[field] === '').map(field => `no ${field}`);

  if (!Number.isFinite(row.durationSeconds) || row.durationSeconds <= 0) {
    problems.push('no duration');
  }

  if (row.kind !== 'real' && row.split === 'heldout' && row.kind !== 'loop') {
    problems.push(`${row.kind} audio in held-out`);
  }

  if ((row.kind === 'derived' || row.kind === 'loop-mix') && row.sourceItems.length === 0) {
    problems.push(`${row.kind} audio names no source`);
  }

  if (row.confidence === 'unresolved' && row.bpm !== null) {
    problems.push('a tempo on an unresolved row');
  }

  return problems;
}

/**
 * Freezes dev and held-out by artist, stratified by the source and genre family, which see no
 * tempo and no score. Sources share a key space, so an artist on two hosts stays on one side.
 * @param rows Real tracks
 * @param seed Fixed seed
 * @returns Split of each id
 */
export function freezeByArtist(
  rows: ReadonlyArray<Pick<ManifestRow, 'id' | 'artistKey' | 'genreFamily'>>,
  seed: string,
): Map<string, Split> {
  const tracks: Track[] = rows.map(row => ({
    set: 'free-mixes',
    id: row.id,
    genre: row.genreFamily,
    bpm: 0,
    group: row.artistKey,
    audioPath: '',
    licence: '',
  }));

  return assignSplit(tracks, seed);
}

type Linkable = {readonly artist: string; readonly artistKey: string; readonly contentKeys: readonly string[]};

/**
 * Artists who must share a side of the split, which is more than one name. The same audio under two
 * names is the leak a split by name misses, and so is "A & B" next to "A".
 * @param rows Every recording, before duplicates go
 * @returns The group of each artist key
 */
export function artistGroups(rows: readonly Linkable[]): ReadonlyMap<string, string> {
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    let root = key;

    while ((parent.get(root) ?? root) !== root) {
      root = parent.get(root) ?? root;
    }

    return root;
  };
  // The smaller name becomes the root, so a group's name does not depend on the order of the rows
  const link = (a: string, b: string) => {
    const [first, second] = [find(a), find(b)].sort();

    parent.set(second, first);
  };

  rows.forEach(row => { parent.set(row.artistKey, find(row.artistKey)); });

  const ownerOfContent = new Map<string, string>();

  for (const row of rows) {
    for (const key of row.contentKeys) {
      const owner = ownerOfContent.get(key);

      if (owner === undefined) {
        ownerOfContent.set(key, row.artistKey);
      } else {
        link(owner, row.artistKey);
      }
    }

    for (const part of row.artist.split(/\s*(?:&|,|\+|\/|\band\b|\bvs\.?\b|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b)\s*/i)) {
      const key = artistKeyOf(part);

      if (key && parent.has(key)) {
        link(key, row.artistKey);
      }
    }
  }

  return new Map([...parent.keys()].map(key => [key, find(key)]));
}

export type FrozenSplit = {
  readonly seed: string;
  /** Side of every artist key ever seen: the record that a rerun may add to and never move */
  readonly artists: Readonly<Record<string, Split>>;
};

/**
 * The side of each artist: a group with a side keeps it, a new group is drawn. A group newly linking
 * artists already on both sides cannot be placed, so its tracks go to no side, and are reported.
 * @param rows Real tracks
 * @param groups Result of `artistGroups`
 * @param frozen What earlier runs froze
 * @returns The record to keep, and the groups that could not be placed
 */
export function extendFreeze(
  rows: ReadonlyArray<Pick<ManifestRow, 'id' | 'artistKey' | 'genreFamily'>>,
  groups: ReadonlyMap<string, string>,
  frozen: FrozenSplit,
): {readonly frozen: FrozenSplit; readonly conflicted: ReadonlySet<string>} {
  const groupOf = (key: string) => groups.get(key) ?? key;
  const sides = new Map<string, Set<Split>>();

  for (const [key, side] of Object.entries(frozen.artists)) {
    sides.set(groupOf(key), (sides.get(groupOf(key)) ?? new Set<Split>()).add(side));
  }

  const conflicted = new Set([...sides].filter(([, side]) => side.size > 1).map(([group]) => group));
  const fresh = freezeByArtist(
    rows.filter(row => !sides.has(groupOf(row.artistKey))).map(row => ({...row, artistKey: groupOf(row.artistKey)})),
    frozen.seed,
  );
  const artists: Record<string, Split> = {...frozen.artists};

  for (const row of rows) {
    const group = groupOf(row.artistKey);
    const known = sides.get(group);
    const side = known ? [...known][0] : fresh.get(row.id);

    if (side && !(row.artistKey in artists) && !conflicted.has(group)) {
      artists[row.artistKey] = side;
    }
  }

  return {frozen: {seed: frozen.seed, artists}, conflicted};
}

/**
 * Keeps one copy of each recording. Hosts overlap, netlabels above all, and a recording on both
 * sides of a split would leak. The copy kept is the first by id, which does not depend on a score.
 * @param rows Rows with their content identity: a hash, or a fingerprint when one exists
 * @returns Rows kept, and for each dropped id the id it duplicates
 */
export function dropDuplicates<T extends {readonly id: string; readonly contentKeys: readonly string[]}>(
  rows: readonly T[],
): {readonly kept: T[]; readonly dropped: ReadonlyMap<string, string>} {
  const owner = new Map<string, string>();
  const dropped = new Map<string, string>();
  const kept: T[] = [];

  for (const row of [...rows].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const twin = row.contentKeys.map(key => owner.get(key)).find(id => id !== undefined);

    if (twin === undefined) {
      kept.push(row);
    } else {
      dropped.set(row.id, twin);
    }

    for (const key of row.contentKeys) {
      if (!owner.has(key)) {
        owner.set(key, twin ?? row.id);
      }
    }
  }

  return {kept, dropped};
}
