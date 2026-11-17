import type {Track} from './types';

/**
 * What may tune the tempogram, so the shipped defaults owe nothing to audio without a licence.
 * Same rule as rba-key-model's DATA-POLICY.md: a set must be named here and every item must carry
 * an exact licence id below, read from the item's source, so a new set is refused until someone
 * has checked it. Provenance of each entry: benchmark/readme.md.
 */
export const tuningSets: ReadonlySet<string> = new Set(['fsld', 'groove', 'guitarset', 'free-mixes']);

/**
 * Licence-clean sets, which dev may score: the tuning sets and RBA-59's contested labels. Those are as
 * clean as the strict ones, but an octave a tracker disputes is no target to tune to, so they are
 * scored and reported and never tuned on.
 */
export const cleanSets: ReadonlySet<string> = new Set([...tuningSets, 'free-mixes-contested']);

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

function assertWithin(tracks: readonly Track[], sets: ReadonlySet<string>, what: string): void {
  const refused = tracks.filter(track => !sets.has(track.set) || !isTuningLicence(track.licence));

  if (refused.length > 0) {
    const named = [...new Set(refused.map(track => `${track.set} (${track.licence})`))];

    throw new Error(`${refused.length} tracks cannot ${what}: ${named.join(', ')}`);
  }
}

/**
 * Refuses a tuning run on anything but the tuning sets' licence-clean audio
 * @param tracks Every track the run would read
 * @throws {Error} Naming the offending sets, before any audio is read
 */
export function assertTunable(tracks: readonly Track[]): void {
  assertWithin(tracks, tuningSets, 'tune the detector, their sets are not tuning sets');
}

/**
 * Refuses a dev scoring on anything but licence-clean audio
 * @param tracks Every track the run would read
 * @throws {Error} Naming the offending sets, before any audio is read
 */
export function assertLicenceClean(tracks: readonly Track[]): void {
  assertWithin(tracks, cleanSets, 'be scored on dev, their sets are evaluation-only');
}

/**
 * The job's tune mode, refused by name before any data is fetched
 * @param sets The sets it would tune on
 * @throws {Error} Naming those that may not tune
 */
export function assertTunableSets(sets: readonly string[]): void {
  const refused = sets.filter(set => !tuningSets.has(set));

  if (refused.length > 0) {
    throw new Error(`Not tuning sets: ${refused.join(', ')}`);
  }
}
