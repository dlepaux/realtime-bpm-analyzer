import * as realtimeBpm from '../../src/index';
import type {Manifest, Closure, AudioFile} from '../types';
import type {BiquadFilterOptions} from '../../src/core/types';

/**
 * Batch an array of closure that triggers a Promise
 * @param closures Array of Closure that returns a Promise
 * @param batchSize Size of the batch
 */
export async function batchPromises(closures: Array<Closure<AudioFile>>, batchSize: number): Promise<AudioFile[]> {
  const audioFiles: AudioFile[] = [];

  for (let i = 0; i < closures.length; i += batchSize) {
    const batch = closures.slice(i, i + batchSize);
    console.log(`Processing batch ${(i / batchSize) + 1} out of ${Math.ceil(closures.length / batchSize)}`);

    const audioFilesBatch = await Promise.all(batch.map(async closure => {
      const promise = closure();
      return promise;
    }));

    audioFiles.push(...audioFilesBatch);
  }

  return audioFiles;
}

/**
 *
 * @param manifest Manifest of audio filename: bpm
 * @param audioContext
 * @returns
 */
export function buildPromises(manifest: Manifest, options?: BiquadFilterOptions): Array<Closure<AudioFile>> {
  const audioContext = new AudioContext();

  return Object.keys(manifest).map(filename => async () => {
    const bpm = manifest[filename];
    const response = await fetch(`/testing/datasets/${encodeURIComponent(filename)}`);
    const buffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(buffer);
    const tempos = await realtimeBpm.analyzeFullBuffer(audioBuffer, options);

    const audioFile: AudioFile = {
      filename,
      bpm,
      tempos: tempos.slice(0, 5),
    };

    return audioFile;
  });
}
