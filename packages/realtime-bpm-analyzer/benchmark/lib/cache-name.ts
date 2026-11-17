/** Most filesystems cap a name at 255 bytes; this leaves room for a suffix and a writer's `.N.tmp`. */
const maxStemBytes = 200;
const keptBytes = 160;
const encoder = new TextEncoder();

/**
 * 53-bit string hash (cyrb53). Not cryptographic: it only has to tell apart ids that share their
 * first 160 bytes, and the ids are ours.
 * @param text Text to hash
 * @returns 14 hex digits
 */
function hash53(text: string): string {
  let h1 = 0xde_ad_be_ef;
  let h2 = 0x41_c6_ce_57;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2_654_435_761);
    h2 = Math.imul(h2 ^ code, 1_597_334_677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2_246_822_507) ^ Math.imul(h2 ^ (h2 >>> 13), 3_266_489_909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2_246_822_507) ^ Math.imul(h1 ^ (h1 >>> 13), 3_266_489_909);

  return ((2_097_151 & h2) * 4_294_967_296 + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/**
 * A cache file stem for a track id. Ids that fit are kept as they are, so existing caches stay valid.
 * RBA-59's ids are archive.org paths and some run past the filesystem's limit (ENAMETOOLONG), so a
 * long one keeps its first 160 bytes, whole characters only, and a hash of the whole id.
 * @param stem The name before its extension
 * @returns A stem of at most 200 bytes, the same for the same id
 */
export function cacheStem(stem: string): string {
  if (encoder.encode(stem).length <= maxStemBytes) {
    return stem;
  }

  let kept = '';

  for (const character of stem) {
    if (encoder.encode(kept + character).length > keptBytes) {
      break;
    }

    kept += character;
  }

  return `${kept}~${hash53(stem)}`;
}
