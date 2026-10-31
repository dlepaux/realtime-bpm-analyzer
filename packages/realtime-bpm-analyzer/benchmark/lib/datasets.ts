import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {evaluationOnly} from './licences';
import type {Track} from './types';

/**
 * Audio and labels stay outside git. Layout and origin of each set: benchmark/readme.md
 */
export const dataRoot = process.env.RBA_TEMPO_ROOT ?? '/Volumes/storage/rba-tempo';

const annotations = join(dataRoot, '_ann');

function readBpm(path: string): number {
  return Number.parseFloat(readFileSync(path, 'utf8').trim().split(/\s+/)[0]);
}

/**
 * GiantSteps Tempo, with the crowdsourced v2 labels of Schreiber & Müller 2018 (v1 came from forum
 * corrections). Three tracks have no v2 tempo and are left out.
 */
function giantsteps(): Track[] {
  const base = join(annotations, 'giantsteps-tempo-dataset-master');
  const audio = join(dataRoot, 'giantsteps/audio');

  return readdirSync(join(base, 'annotations_v2/tempo'))
    .filter(name => name.endsWith('.bpm'))
    .map(name => {
      const id = name.replace('.bpm', '');

      return {
        set: 'giantsteps',
        id,
        genre: readFileSync(join(base, 'annotations/genre', `${id}.genre`), 'utf8').trim().split(/\r?\n/)[0],
        bpm: readBpm(join(base, 'annotations_v2/tempo', name)),
        group: id,
        audioPath: join(audio, `${id}.mp3`),
        licence: evaluationOnly,
      };
    })
    .filter(track => track.bpm > 0);
}

/**
 * Recordings Bob Sturm found twice in Ballroom, as listed in the BallroomAnnotations readme.
 * Same album replicas already share a group; these cross one.
 */
const ballroomReplicas: Record<string, string> = {
  'Media-104705': 'Albums-Secret_Garden',
  'Media-103414': 'Albums-Latin_Jam3',
  'Media-103415': 'Media-103402',
};

function ballroomGroup(id: string): string {
  const replica = ballroomReplicas[id];

  if (replica) {
    return replica;
  }

  return id.startsWith('Albums-') ? id.replace(/-\d+$/, '') : id;
}

/**
 * Ballroom (Gouyon et al. 2006), with the contest's tempo labels. An album stays on one side.
 */
function ballroom(): Track[] {
  const base = join(dataRoot, 'ballroom/BallroomData');
  const labels = join(dataRoot, 'ballroom/BallroomAnnotations/ballroomGroundTruth');

  return readdirSync(base, {withFileTypes: true})
    .filter(entry => entry.isDirectory())
    .flatMap(entry => readdirSync(join(base, entry.name))
      .filter(name => name.endsWith('.wav'))
      .map(name => {
        const id = name.replace('.wav', '');

        return {
          set: 'ballroom',
          id,
          genre: entry.name.replace(/^Rumba-.*/, 'Rumba'),
          bpm: readBpm(join(labels, `${id}.bpm`)),
          group: ballroomGroup(id),
          audioPath: join(base, entry.name, name),
          licence: evaluationOnly,
        };
      }));
}

/**
 * GTZAN with the tempo labels of Marchand & Peeters. A block of ten consecutive clips stays on one
 * side, because Sturm 2013 shows artists and repeats run in sequence in this set.
 */
function gtzan(): Track[] {
  const base = join(dataRoot, 'gtzan/genres');
  const labels = join(annotations, 'gtzan_tempo_beat-main/tempo');

  return readdirSync(labels)
    .filter(name => name.endsWith('.bpm'))
    .map(name => {
      const [, genre, number] = /gtzan_(\w+)_(\d+)\.bpm/.exec(name)!;

      return {
        set: 'gtzan',
        id: `${genre}.${number}`,
        genre,
        bpm: readBpm(join(labels, name)),
        group: `${genre}-${Math.floor(Number(number) / 10)}`,
        audioPath: join(base, genre, `${genre}.${number}.wav`),
        licence: evaluationOnly,
      };
    })
    .filter(track => existsSync(track.audioPath));
}

const guitarsetStyles: Record<string, string> = {
  BN: 'BossaNova', Funk: 'Funk', Jazz: 'Jazz', Rock: 'Rock', SS: 'SingerSongwriter',
};

/**
 * GuitarSet, whose tempo is in the file name. Every player plays each progression at each of its
 * tempos, so that piece stays on one side. The same progression at another tempo can straddle.
 */
function guitarset(): Track[] {
  const base = join(dataRoot, 'guitarset/audio_mono-mic');

  return readdirSync(base)
    .filter(name => name.endsWith('_mic.wav'))
    .map(name => {
      const id = name.replace('_mic.wav', '');
      const [, style, progression, tempo] = /^\d+_([A-Za-z]+)(\d)-(\d+)-/.exec(id)!;

      return {
        set: 'guitarset',
        id,
        genre: guitarsetStyles[style],
        bpm: Number(tempo),
        group: `${style}${progression}-${tempo}`,
        audioPath: join(base, name),
        licence: 'CC-BY-4.0',
      };
    });
}

/** Freesound's licence URLs, exact: anything else in the metadata stays evaluation-only */
const freesoundLicences: Record<string, string> = {
  'http://creativecommons.org/publicdomain/zero/1.0/': 'CC0-1.0',
  'http://creativecommons.org/licenses/by/3.0/': 'CC-BY-3.0',
};

/** Seconds a loop repeats up to: the first bpmStable comes after about 12 */
const loopSeconds = 30;

type FreesoundMetadata = Record<string, {username: string; license: string}>;

type LoopAnnotation = {
  discard: boolean;
  defined_tempo: boolean;
  well_cut: boolean;
  bpm: string;
  genres: string[];
};

function loopAnnotations(base: string): Map<string, LoopAnnotation[]> {
  const byLoop = new Map<string, LoopAnnotation[]>();
  const root = join(base, 'annotations');

  // Sorted: the first annotator gives the label and the genre, and directory order differs per filesystem
  const annotators = readdirSync(root, {withFileTypes: true}).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();

  for (const annotator of annotators) {
    for (const name of readdirSync(join(root, annotator)).filter(file => file.endsWith('.json'))) {
      const id = name.replace('sound-', '').replace('.json', '');
      const annotation = JSON.parse(readFileSync(join(root, annotator, name), 'utf8')) as LoopAnnotation;

      byLoop.set(id, [...(byLoop.get(id) ?? []), annotation]);
    }
  }

  return byLoop;
}

/**
 * Tempo of a loop from its expert annotators, or null when none is trustworthy: an annotator threw
 * it out, heard no defined tempo or a bad cut, or two annotators are more than 4% apart. The BPM in
 * the Freesound metadata is the uploader's, so it is not used.
 */
function agreedTempo(annotations: readonly LoopAnnotation[]): number | null {
  const tempos = annotations.map(annotation => Number.parseFloat(annotation.bpm));
  const isUsable = annotations.every(annotation => !annotation.discard && annotation.defined_tempo && annotation.well_cut);

  if (!isUsable || !tempos.every(tempo => tempo > 0) || Math.max(...tempos) > 1.04 * Math.min(...tempos)) {
    return null;
  }

  return tempos[0];
}

/**
 * Freesound Loop Dataset (Ramires et al. 2020), loops with an expert tempo. The licence is the
 * loop's own Freesound licence. An uploader stays on one side: their loops are often one pack.
 */
function freesoundLoops(): Track[] {
  const base = join(dataRoot, 'fsld');
  const metadata = JSON.parse(readFileSync(join(base, 'FSL10K/metadata.json'), 'utf8')) as FreesoundMetadata;
  const audio = readdirSync(join(base, 'FSL10K/audio/wav'));
  const audioOf = new Map(audio.map(name => [name.split('_')[0].replace(/\..*$/, ''), name]));

  return [...loopAnnotations(base)].flatMap(([id, annotations]) => {
    const bpm = agreedTempo(annotations);
    const item = metadata[id];
    const file = audioOf.get(id);

    if (bpm === null || !item || !file) {
      return [];
    }

    return [{
      set: item.license in freesoundLicences ? 'fsld' : 'fsld-nc',
      id,
      genre: annotations[0].genres[0] ?? 'none',
      bpm,
      group: item.username,
      audioPath: join(base, 'FSL10K/audio/wav', file),
      licence: freesoundLicences[item.license] ?? evaluationOnly,
      loopToSeconds: loopSeconds,
    }];
  });
}

/** Performances under this long are fills and fragments: a stable reading needs about 12 s */
const shortestPerformance = 16;

/**
 * Groove MIDI Dataset (Gillick et al. 2019), human drumming through a Roland TD-11, with the
 * metronome tempo it was played to. A drummer's session stays on one side.
 */
function groove(): Track[] {
  const base = join(dataRoot, 'groove/groove');
  const [header, ...rows] = readFileSync(join(base, 'info.csv'), 'utf8').trim().split(/\r?\n/).map(line => line.split(','));
  const column = (name: string) => header.indexOf(name);

  return rows
    .filter(row => row[column('audio_filename')] !== '' && row[column('beat_type')] === 'beat'
      && Number(row[column('duration')]) >= shortestPerformance)
    .map(row => ({
      set: 'groove',
      id: row[column('id')].replaceAll('/', '-'),
      genre: row[column('style')].split('/')[0],
      bpm: Number(row[column('bpm')]),
      group: `${row[column('drummer')]}-${row[column('session')]}`,
      audioPath: join(base, row[column('audio_filename')]),
      licence: 'CC-BY-4.0',
    }));
}

const fsld = (): Track[] => freesoundLoops().filter(track => track.set === 'fsld');
const fsldNc = (): Track[] => freesoundLoops().filter(track => track.set === 'fsld-nc');

export const loaders: Record<string, () => Track[]> = {
  giantsteps, ballroom, gtzan, guitarset, fsld, 'fsld-nc': fsldNc, groove,
};
