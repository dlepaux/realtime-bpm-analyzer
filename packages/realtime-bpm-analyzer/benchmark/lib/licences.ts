import type {Track} from './types';

/**
 * What may tune the tempogram, so the shipped defaults owe nothing to audio without a licence.
 * Same rule as rba-key-model's DATA-POLICY.md: a set must be named here and every item must carry
 * an exact licence id below, read from the item's source, so a new set is refused until someone
 * has checked it. Provenance of each entry: benchmark/readme.md.
 */
export const tuningSets: ReadonlySet<string> = new Set(['fsld', 'groove', 'guitarset', 'free-mixes', 'free-mixes-contested']);

export const tuningLicences: ReadonlySet<string> = new Set([
  'CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0', 'CC-BY-SA-3.0', 'CC-BY-SA-4.0',
]);

/**
 * RBA-59 kept an item only on an exact Creative Commons URL for CC0, CC BY or CC BY-SA, and FMA and the
 * Internet Archive carry every version and port of those two (CC-BY-2.5-CA, CC-BY-SA-3.0-US). Each is
 * the same grant RBA-51's licence rule names, so the version and port are not a reason to refuse.
 */
const portedLicence = /^CC-BY(?:-SA)?-[1-4]\.\d(?:-[A-Z]{2})?$/;

/**
 * @param licence SPDX-style id read from the item's source
 * @returns Whether that licence may tune
 */
export function isTuningLicence(licence: string): boolean {
  return tuningLicences.has(licence) || portedLicence.test(licence);
}

/** Licence of an item scored but never tuned on: no licence found, or one that excludes this use */
export const evaluationOnly = 'evaluation-only';

/**
 * Refuses a tuning run on anything but licence-clean audio
 * @param tracks Every track the run would read
 * @throws {Error} Naming the offending sets, before any audio is read
 */
export function assertTunable(tracks: readonly Track[]): void {
  const refused = tracks.filter(track => !tuningSets.has(track.set) || !isTuningLicence(track.licence));

  if (refused.length > 0) {
    const sets = [...new Set(refused.map(track => `${track.set} (${track.licence})`))];

    throw new Error(`${refused.length} tracks cannot tune the detector, their sets are evaluation-only: ${sets.join(', ')}`);
  }
}
