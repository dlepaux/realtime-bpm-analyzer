import type {Split, Track} from './types';

/**
 * Stable 32-bit FNV-1a, so a split depends only on the seed and the ids. Ends with MurmurHash3's
 * finaliser: plain FNV-1a keeps strings that differ in their last characters in nearly the same
 * order under any prefix, which would make the seed almost irrelevant.
 * @param text Text to hash
 * @returns Unsigned hash
 */
export function fnv1a(text: string): number {
  let hash = 0x81_1C_9D_C5;

  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01_00_01_93) >>> 0;
  }

  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85_EB_CA_6B);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xC2_B2_AE_35);
  hash ^= hash >>> 16;

  return hash >>> 0;
}

/**
 * Splits a set in two, by group, stratified by genre. Groups of one genre are ordered by a seeded
 * hash and dealt alternately, so neither side depends on any result and the genres stay balanced.
 * @param tracks Every track of one set
 * @param seed Fixed seed
 * @returns Split of each track id
 */
export function assignSplit(tracks: readonly Track[], seed: string): Map<string, Split> {
  const groupGenre = new Map<string, string>();

  for (const track of tracks) {
    if (!groupGenre.has(track.group)) {
      groupGenre.set(track.group, track.genre);
    }
  }

  const genres = [...new Set(groupGenre.values())].sort();
  const groupSplit = new Map<string, Split>();

  for (const genre of genres) {
    const groups = [...groupGenre.keys()]
      .filter(group => groupGenre.get(group) === genre)
      .sort((a, b) => fnv1a(`${seed}:${a}`) - fnv1a(`${seed}:${b}`) || (a < b ? -1 : 1));

    for (const [index, group] of groups.entries()) {
      groupSplit.set(group, index % 2 === 0 ? 'dev' : 'heldout');
    }
  }

  return new Map(tracks.map(track => [track.id, groupSplit.get(track.group)!]));
}
