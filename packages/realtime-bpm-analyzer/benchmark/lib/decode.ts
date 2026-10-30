import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {dataRoot} from './datasets';
import {repeatTo} from './stream';
import type {Track} from './types';

export const sampleRate = 44_100;

/**
 * Decodes a track to what a worklet reads: `process()` takes `inputs[0][0]`, the left channel, so
 * this keeps the left channel instead of a downmix. ffmpeg writes to a pipe, nothing is played.
 * @param track The track
 * @returns Mono PCM at {@link sampleRate}, cached outside git
 */
export function decode(track: Track): Float32Array {
  const cachePath = join(dataRoot, 'pcm', track.set, `${track.id}.f32`);

  if (!existsSync(cachePath)) {
    const {status, stdout} = spawnSync('ffmpeg', [
      '-v', 'error', '-i', track.audioPath, '-af', 'pan=mono|c0=c0', '-ar', String(sampleRate), '-f', 'f32le', 'pipe:1',
    ], {maxBuffer: 2 ** 30});

    if (status !== 0 || stdout.length === 0) {
      throw new Error(`ffmpeg could not decode ${track.audioPath}`);
    }

    mkdirSync(dirname(cachePath), {recursive: true});
    writeFileSync(cachePath, stdout);
  }

  const bytes = readFileSync(cachePath);
  const pcm = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4).slice();

  return track.loopToSeconds === undefined ? pcm : repeatTo(pcm, track.loopToSeconds * sampleRate);
}
