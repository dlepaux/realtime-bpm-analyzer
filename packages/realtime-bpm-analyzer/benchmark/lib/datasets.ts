import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
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
      };
    })
    .filter(track => existsSync(track.audioPath));
}

const guitarsetStyles: Record<string, string> = {
  BN: 'BossaNova', Funk: 'Funk', Jazz: 'Jazz', Rock: 'Rock', SS: 'SingerSongwriter',
};

/**
 * GuitarSet, whose tempo is in the file name. Every player plays each progression, so a
 * progression stays on one side.
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
      };
    });
}

export const loaders: Record<string, () => Track[]> = {giantsteps, ballroom, gtzan, guitarset};
