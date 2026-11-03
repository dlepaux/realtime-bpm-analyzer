import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {dataRoot} from './datasets';
import {devTracks} from './free-mixes-rows';
import type {FreeSet} from './free-mixes-rows';
import type {Track} from './types';

// Reads RBA-59's dev half off the volume. What it keeps, and why held-out cannot pass: lib/free-mixes-rows.ts

let cached: Record<FreeSet, Track[]> | null = null;

function load(): Record<FreeSet, Track[]> {
  if (cached === null) {
    const root = join(dataRoot, 'free-data');
    const splitIds = readFileSync(join(root, 'split-ids.json'), 'utf8');

    cached = devTracks(splitIds, readFileSync(join(root, 'manifest.jsonl'), 'utf8'));
    // RBA-59 may still re-place a few ids, so a result names the dev list it read
    console.error(`free-mixes: dev list sha256 ${createHash('sha256').update(JSON.stringify((JSON.parse(splitIds) as {dev: string[]}).dev)).digest('hex').slice(0, 16)}, strict ${cached['free-mixes'].length}, contested ${cached['free-mixes-contested'].length}`);
  }

  return cached;
}

/** Dev only, see the module's note. Asked for by name, never part of a default held-out run */
export const freeLoaders: Record<FreeSet, () => Track[]> = {
  'free-mixes': () => load()['free-mixes'],
  'free-mixes-contested': () => load()['free-mixes-contested'],
};
