import type {Track} from './types';

/**
 * RBA-59's licence-clean full mixes. A caller reads one half: the ids of that half in split-ids.json,
 * skipping every manifest line whose id is not one of them before parsing it, and refusing a parsed row
 * that names the other half. Dev feeds tuning. Held-out is read only by RBA-51's one look, which its
 * DECISION of 2026-11-03 opened: `freeHeldoutRefusal` holds that scope, and tuning refuses held-out in
 * any form. The sets are kept out of `loaders` on purpose, which is every other route to held-out in
 * run.ts and job.ts. Layout and labels: RBA-59's free-data.ts on feat/rba-59-free-data.
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
 * @param split The half to read
 * @param splitIds Text of split-ids.json
 * @param manifest Text of manifest.jsonl
 * @returns That half's labelled real tracks, per tier
 * @throws {Error} When a line's id cannot be read before parsing, or a parsed row is of the other half
 */
export function splitTracks(split: 'dev' | 'heldout', splitIds: string, manifest: string): Record<FreeSet, Track[]> {
  const ids = (JSON.parse(splitIds) as Partial<Record<string, string[]>>)[split];

  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error(`split-ids.json has no ${split} ids`);
  }

  const wanted = new Set(ids);
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

    if (!wanted.has(id)) {
      continue;
    }

    const row = JSON.parse(line) as ManifestRow;
    const tier = tierOf(row);

    if (row.split !== split || row.id !== id) {
      throw new Error(`${id} is in split-ids.json's ${split} list but its row says ${row.split}`);
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
 * @param splitIds Text of split-ids.json
 * @param manifest Text of manifest.jsonl
 * @returns The dev half's labelled real tracks, per tier
 */
export function devTracks(splitIds: string, manifest: string): Record<FreeSet, Track[]> {
  return splitTracks('dev', splitIds, manifest);
}

/**
 * RBA-51's look at this half scores these detectors on these sets, whole, and nothing else: a narrower
 * or wider run would spend the one look on something the bar cannot judge. Kept here, beside the
 * refusal, so both entry points read one list. lib/free-look.ts holds the same lists for its verdict,
 * and a test holds them together.
 */
export const freeLookScope = {detectors: ['peaks', 'tempogram'], sets: ['free-mixes', 'free-mixes-contested']} as const;

/**
 * The one refusal both entry points apply before anything is logged or read: run.ts before its look's
 * log line, so naming a free set spends nothing, and job.ts as a usage error. Held-out on a free set is
 * RBA-51's look and nothing else: both free sets, no other set, and exactly the look's detectors.
 * @param split The split asked for
 * @param sets The sets asked for
 * @param detectorNames The detectors asked for
 * @returns Why the run must not start, or null when it may
 */
export function freeHeldoutRefusal(split: string, sets: readonly string[], detectorNames: readonly string[]): string | null {
  if (split !== 'heldout' || !sets.some(set => isFreeSet(set))) {
    return null;
  }

  const isSame = (a: readonly string[], b: readonly string[]) => [...a].sort().join() === [...b].sort().join();

  return isSame(sets, freeLookScope.sets) && isSame(detectorNames, freeLookScope.detectors)
    ? null
    : `Held-out on RBA-59's sets is RBA-51's one look: ${freeLookScope.detectors.join(', ')} on ${freeLookScope.sets.join(', ')}, no more and no less`;
}

/**
 * job.ts's guard on its modes: the clean sets' heldout mode never takes a free set, so the free-mix
 * look runs only as its own mode, with its own log and budget. Tuning reads dev loaders alone.
 * @param mode The job's mode
 * @param sets The sets asked for
 * @returns Why the job must not start, or null when it may
 */
export function freeJobModeRefusal(mode: string, sets: readonly string[]): string | null {
  return mode === 'heldout' && sets.some(set => isFreeSet(set))
    ? 'RBA-59\'s sets have no place in the heldout mode: their one look is the free-look mode'
    : null;
}

/**
 * @param set A set name
 * @returns Whether it is one of RBA-59's sets
 */
export function isFreeSet(set: string): set is FreeSet {
  return (freeSets as readonly string[]).includes(set);
}
