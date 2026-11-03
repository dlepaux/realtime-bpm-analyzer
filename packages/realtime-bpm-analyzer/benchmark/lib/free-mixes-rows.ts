import type {Track} from './types';

/**
 * RBA-59's licence-clean full mixes, dev half only. RBA-51's held-out look on them waits for a DECISION,
 * so this module has no way to read the other half: it reads the dev ids of split-ids.json, skips every
 * manifest line whose id is not one of them before parsing it, and refuses a parsed row that says it is
 * not dev. The sets are kept out of `loaders` on purpose, which is every route to held-out in run.ts and
 * job.ts. Layout and labels: RBA-59's free-data.ts on feat/rba-59-free-data.
 */
export const freeSets = ['free-mixes', 'free-mixes-contested'] as const;

export type FreeSet = (typeof freeSets)[number];

/**
 * Seconds of each mix that are scored, from its start: a listener opens a track at its beginning, and
 * mixes run 92 s to many minutes (5th percentile 92 s, median 252 s on dev), which would otherwise weigh
 * a track by its length and cost hours per sweep row. A stable reading needs about 12 s.
 */
export const excerptSeconds = 60;

/** The fields of a manifest row this reads. The full type lives with RBA-59's pipeline */
type ManifestRow = {
  readonly id: string;
  readonly kind: string;
  readonly split: string;
  readonly artistKey: string;
  readonly genreFamily: string;
  readonly licence: string;
  readonly bpm: number | null;
  readonly confidence: string;
  readonly audioPath: string;
  readonly labelProvenance: {readonly octaveSplit?: boolean; readonly halvesAgree?: boolean | null};
};

/**
 * The tier of a label. Strict is RBA-59's report verdict rule without its genre and licence-class
 * target filters: a tempo, no tracker an octave away, and one tempo through both halves. A label a
 * tracker contests by an octave, or whose halves disagree, is contested. No tempo, no tier.
 * @param row A manifest row
 * @returns The set it scores in, or null when it has no label
 */
export function tierOf(row: Pick<ManifestRow, 'bpm' | 'labelProvenance'>): FreeSet | null {
  if (row.bpm === null) {
    return null;
  }

  return row.labelProvenance.octaveSplit === true || row.labelProvenance.halvesAgree === false ? 'free-mixes-contested' : 'free-mixes';
}

const idAtStart = /^\{"id":"([^"]+)"/;

/**
 * @param splitIds Text of split-ids.json
 * @param manifest Text of manifest.jsonl
 * @returns The dev half's labelled real tracks, per tier
 * @throws {Error} When a line's id cannot be read before parsing, or a parsed row is not dev
 */
export function devTracks(splitIds: string, manifest: string): Record<FreeSet, Track[]> {
  const dev = new Set((JSON.parse(splitIds) as {dev: string[]}).dev);
  const out: Record<FreeSet, Track[]> = {'free-mixes': [], 'free-mixes-contested': []};

  for (const line of manifest.split('\n')) {
    if (line === '') {
      continue;
    }

    const id = idAtStart.exec(line)?.[1];

    // The id is read off the raw line, so a line of the other half is never parsed. A line this cannot
    // place is refused rather than parsed to find out
    if (id === undefined) {
      throw new Error(`A manifest line does not start with its id: ${line.slice(0, 40)}`);
    }

    if (!dev.has(id)) {
      continue;
    }

    const row = JSON.parse(line) as ManifestRow;
    const tier = tierOf(row);

    if (row.split !== 'dev' || row.id !== id) {
      throw new Error(`${id} is in split-ids.json's dev list but its row says ${row.split}`);
    }

    if (row.kind === 'real' && tier !== null) {
      out[tier].push({
        set: tier,
        id: row.id,
        genre: row.genreFamily,
        bpm: row.bpm!,
        group: row.artistKey,
        audioPath: row.audioPath,
        licence: row.licence,
        label: row.confidence,
        excerptSeconds,
      });
    }
  }

  return out;
}

/**
 * @param set A set name
 * @returns Whether it is one of RBA-59's dev-only sets
 */
export function isFreeSet(set: string): set is FreeSet {
  return (freeSets as readonly string[]).includes(set);
}
