import type {ManifestRow} from './manifest';
import {normaliseKey} from './consensus';

/**
 * Audio made from labelled real tracks and loops. The rules live here so no caller can break them:
 * a derived row keeps its source's licence and attribution, says what it came from, and only ever
 * comes from a source on the dev side, since audio from a held-out track on the dev side would leak.
 */

const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * @param key A normalised key
 * @param semitones Shift
 * @returns The key after the shift, in normal form
 */
export function transposeKey(key: string, semitones: number): string {
  const normal = normaliseKey(key);

  if (normal === null) {
    throw new Error(`not a key: ${key}`);
  }

  const [note, mode] = normal.split(' ');

  return `${notes[(notes.indexOf(note) + semitones + 120) % 12]} ${mode}`;
}

export type Transform = {
  /** New tempo over old tempo */
  readonly tempoFactor: number;
  readonly semitones: number;
};

/**
 * FFmpeg's own filters: `atempo` to stretch, and resampling with `atempo` to undo the speed for a
 * pitch shift. It is a phase-vocoder-free overlap method, audible on transients, which the report
 * says, and it needs no extra licence to check.
 * @param transform What to do
 * @param rate Sample rate to work at, whatever the source's
 * @returns The filter graph
 */
export function ffmpegFilter(transform: Transform, rate: number): string {
  const pitch = 2 ** (transform.semitones / 12);
  const stretch = transform.tempoFactor / pitch;

  if (stretch < 0.5 || stretch > 2) {
    throw new Error(`stretch ${stretch} is outside what one atempo stage does`);
  }

  // Resampled first: asetrate multiplies the rate it is told about, so a 48 kHz source would come
  // out about 8% off its label
  const shifted = transform.semitones === 0 ? [] : [`aresample=${rate}`, `asetrate=${Math.round(rate * pitch)}`, `aresample=${rate}`];

  return [...shifted, `atempo=${stretch.toFixed(6)}`].join(',');
}

/**
 * The factors that bring a labelled tempo into a fast band, gently: the further from 1, the worse the
 * artefacts, and a factor over this is a different piece of music.
 * @param bpm Source tempo
 * @param targets Tempos wanted
 * @param most Largest factor either way
 * @returns Factors in range, from each target
 */
export function factorsTowards(bpm: number, targets: readonly number[], most = 1.25): number[] {
  return targets
    .map(target => target / bpm)
    .filter(factor => factor !== 1 && factor <= most && factor >= 1 / most);
}

/**
 * The manifest row of a derived track
 * @param source Labelled real row, on dev
 * @param transform What was done
 * @param audio The derived file's identity
 * @returns The row. The label carries over exactly by construction
 * @throws {Error} When the source is held out, unlabelled or itself derived
 */
export function derivedRow(
  source: ManifestRow,
  transform: Transform,
  audio: Pick<ManifestRow, 'sha256' | 'durationSeconds' | 'audioPath'>,
): ManifestRow {
  if (source.split !== 'dev' || source.kind !== 'real' || source.bpm === null) {
    throw new Error(`${source.id} cannot be a source: it must be real, labelled and on dev`);
  }

  const bpm = Math.round(source.bpm * transform.tempoFactor * 100) / 100;

  return {
    ...source,
    ...audio,
    id: `${source.id}~t${transform.tempoFactor.toFixed(4)}~p${transform.semitones}`,
    kind: 'derived',
    bpm,
    key: source.key === null ? null : transposeKey(source.key, transform.semitones),
    confidence: 'carried',
    labelProvenance: {
      method: `carried from ${source.id} (${source.confidence}), tempo x${transform.tempoFactor.toFixed(4)}, ${transform.semitones} semitones`,
      votes: [],
      hintBpm: null,
    },
    sourceItems: [source.id],
    split: 'dev',
  };
}
