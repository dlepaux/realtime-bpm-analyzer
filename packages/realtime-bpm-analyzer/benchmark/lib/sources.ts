import type {Split, Track} from './types';

export type Hash = {readonly algorithm: 'md5' | 'sha256'; readonly value: string};

/** Where a set's files come from. Every byte is pinned: an archive by hash, a label repo by commit */
export type Source = {readonly name: string; readonly sets: readonly string[]; readonly into: string} & (
  | {readonly kind: 'archive'; readonly url: string; readonly hash: Hash; readonly only?: readonly string[]}
  // Git checks every object against the commit id, unlike a GitHub tarball whose bytes can change
  | {readonly kind: 'git'; readonly url: string; readonly commit: string}
  // One md5 file per audio file, published by the set itself
  | {readonly kind: 'files'; readonly baseUrl: string; readonly md5Dir: string}
);

const giantstepsLabels = '_ann/giantsteps-tempo-dataset-master';

/**
 * Everything the job downloads, in order: labels first, since the GiantSteps audio list is in its
 * label repo. Hosts here are the job's allowlist: keep the job spec on RBA-51 in step. Hashes are
 * the publishers' own (Zenodo, Google Cloud Storage's x-goog-hash, Hugging Face's LFS pointer),
 * except ballroom-labels, whose host publishes none, so it is the sha-256 seen on 2026-10-31.
 */
export const sources: readonly Source[] = [
  {
    name: 'giantsteps-labels',
    sets: ['giantsteps'],
    into: giantstepsLabels,
    kind: 'git',
    url: 'https://github.com/GiantSteps/giantsteps-tempo-dataset.git',
    commit: 'd51ab2422e76abacfaa86616a57054bc222ec9fd',
  },
  {
    name: 'giantsteps-audio',
    sets: ['giantsteps'],
    into: 'giantsteps/audio',
    kind: 'files',
    baseUrl: 'https://www.cp.jku.at/datasets/giantsteps/backup/',
    md5Dir: `${giantstepsLabels}/md5`,
  },
  {
    name: 'gtzan-labels',
    sets: ['gtzan'],
    into: '_ann/gtzan_tempo_beat-main',
    kind: 'git',
    url: 'https://github.com/TempoBeatDownbeat/gtzan_tempo_beat.git',
    commit: 'fd9cafdebb6426fee41c3718791be61306323dd7',
  },
  {
    name: 'gtzan-audio',
    sets: ['gtzan'],
    into: 'gtzan',
    kind: 'archive',
    url: 'https://huggingface.co/datasets/marsyas/gtzan/resolve/d2146561ecc7df707d9e6b8318885fe6a39668a2/data/genres.tar.gz',
    hash: {algorithm: 'sha256', value: 'b28cc067ff6199bd826f5d1a6931458586d64acae7f44b2e882b7a97af057531'},
  },
  {
    name: 'ballroom-audio',
    sets: ['ballroom'],
    into: 'ballroom',
    kind: 'archive',
    url: 'https://mtg.upf.edu/ismir2004/contest/tempoContest/data1.tar.gz',
    hash: {algorithm: 'md5', value: '2872a3e52070bc342a4510a95e2fa0b8'},
  },
  {
    name: 'ballroom-labels',
    sets: ['ballroom'],
    into: 'ballroom',
    kind: 'archive',
    url: 'https://mtg.upf.edu/ismir2004/contest/tempoContest/data2.tar.gz',
    hash: {algorithm: 'sha256', value: 'e862906fc9c0b7500d052bb8ff997ef217387cf7a1d5ac5ca7437fd9044dc131'},
  },
  {
    name: 'guitarset-audio',
    sets: ['guitarset'],
    into: 'guitarset/audio_mono-mic',
    kind: 'archive',
    url: 'https://zenodo.org/api/records/3371780/files/audio_mono-mic.zip/content',
    hash: {algorithm: 'md5', value: '275966d6610ac34999b58426beb119c3'},
  },
  {
    name: 'fsld-annotations',
    sets: ['fsld', 'fsld-nc'],
    into: 'fsld',
    kind: 'archive',
    url: 'https://zenodo.org/api/records/3967852/files/annotations.zip/content',
    hash: {algorithm: 'md5', value: '3920ee437802cf047a990b2968fa066c'},
  },
  {
    name: 'fsld-audio',
    sets: ['fsld', 'fsld-nc'],
    into: 'fsld/FSL10K',
    kind: 'archive',
    url: 'https://zenodo.org/api/records/3967852/files/FSL10K.zip/content',
    hash: {algorithm: 'md5', value: 'c260a1203a82c1dda80ec1de75e5e23f'},
    only: ['audio/wav/*', 'metadata.json'],
  },
  {
    name: 'groove-audio',
    sets: ['groove'],
    into: 'groove',
    kind: 'archive',
    url: 'https://storage.googleapis.com/magentadata/datasets/groove/groove-v1.0.0.zip',
    hash: {algorithm: 'md5', value: '99db7e2a087761a913b2abfb19e86181'},
  },
];

export type SplitFile = {readonly seed: string; readonly dev: readonly string[]; readonly heldout: readonly string[]};

export type SetReport = {
  readonly dev: number;
  readonly heldout: number;
  readonly found: number;
  /** Ids of the frozen split that the rebuild does not have, or has without audio */
  readonly missing: readonly string[];
  /** Ids the rebuild has and the frozen split does not */
  readonly unexpected: readonly string[];
  /** Ids the seed now deals to the other side: the labels or groups are not the ones the split saw */
  readonly differs: readonly string[];
};

/**
 * Compares a rebuilt set with its frozen split. The split must survive the rebuild byte for byte:
 * it is what keeps held-out unseen, so a difference is reported, never repaired.
 * @param frozen The committed split
 * @param tracks What the loader finds now
 * @param dealt Side of each track under the frozen seed, for sets whose split came from the seed
 * @param hasAudio Whether a track's audio file exists and is not empty
 * @returns The comparison
 */
export function compareSplit(
  frozen: SplitFile,
  tracks: readonly Track[],
  dealt: ReadonlyMap<string, Split> | null,
  hasAudio: (track: Track) => boolean,
): SetReport {
  const sides = new Map<string, Split>([
    ...frozen.dev.map(id => [id, 'dev'] as const),
    ...frozen.heldout.map(id => [id, 'heldout'] as const),
  ]);
  const usable = new Set(tracks.filter(track => hasAudio(track)).map(track => track.id));

  return {
    dev: frozen.dev.length,
    heldout: frozen.heldout.length,
    found: tracks.filter(track => sides.has(track.id) && usable.has(track.id)).length,
    missing: [...sides.keys()].filter(id => !usable.has(id)),
    unexpected: tracks.filter(track => !sides.has(track.id)).map(track => track.id),
    differs: [...sides].filter(([id, side]) => dealt?.has(id) && dealt.get(id) !== side).map(([id]) => id),
  };
}

/**
 * @param report One set's comparison
 * @returns Whether the rebuilt set is the set that was split
 */
export function isComplete(report: SetReport): boolean {
  return report.missing.length === 0 && report.differs.length === 0;
}
