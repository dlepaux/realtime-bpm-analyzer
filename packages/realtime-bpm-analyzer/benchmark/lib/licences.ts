import type {Track} from './types';

/**
 * What may tune the tempogram, so the shipped defaults owe nothing to audio without a licence.
 * Same rule as rba-key-model's DATA-POLICY.md: a set must be named here and every item must carry
 * an exact licence id below, read from the item's source, so a new set is refused until someone
 * has checked it. Provenance of each entry: benchmark/readme.md.
 */
export const tuningSets: ReadonlySet<string> = new Set(['fsld', 'groove', 'guitarset']);

export const tuningLicences: ReadonlySet<string> = new Set([
  'CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0', 'CC-BY-SA-3.0', 'CC-BY-SA-4.0',
]);

/** Licence of an item scored but never tuned on: no licence found, or one that excludes this use */
export const evaluationOnly = 'evaluation-only';

/**
 * Refuses a tuning run on anything but licence-clean audio
 * @param tracks Every track the run would read
 * @throws {Error} Naming the offending sets, before any audio is read
 */
export function assertTunable(tracks: readonly Track[]): void {
  const refused = tracks.filter(track => !tuningSets.has(track.set) || !tuningLicences.has(track.licence));

  if (refused.length > 0) {
    const sets = [...new Set(refused.map(track => `${track.set} (${track.licence})`))];

    throw new Error(`${refused.length} tracks cannot tune the detector, their sets are evaluation-only: ${sets.join(', ')}`);
  }
}
