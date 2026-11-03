import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {dataRoot} from './datasets';
import {splitTracks} from './free-mixes-rows';
import type {FreeSet} from './free-mixes-rows';
import type {Track} from './types';

// Reads one of RBA-59's halves off the volume. What it keeps, and why held-out is only RBA-51's look:
// lib/free-mixes-rows.ts

type Half = 'dev' | 'heldout';

const cached = new Map<Half, Record<FreeSet, Track[]>>();

function load(split: Half): Record<FreeSet, Track[]> {
  const kept = cached.get(split);

  if (kept !== undefined) {
    return kept;
  }

  const root = join(dataRoot, 'free-data');
  const splitIds = readFileSync(join(root, 'split-ids.json'), 'utf8');
  const tracks = splitTracks(split, splitIds, readFileSync(join(root, 'manifest.jsonl'), 'utf8'));
  const ids = (JSON.parse(splitIds) as Record<Half, string[]>)[split];

  cached.set(split, tracks);
  // RBA-59's ids are final since 2026-11-03, and a result still names the list it read
  console.error(`free-mixes: ${split} list sha256 ${createHash('sha256').update(JSON.stringify(ids)).digest('hex').slice(0, 16)}, strict ${tracks['free-mixes'].length}, contested ${tracks['free-mixes-contested'].length}`);

  return tracks;
}

/** Dev, for tuning and dev scoring. Asked for by name, never part of a default run */
export const freeLoaders: Record<FreeSet, () => Track[]> = {
  'free-mixes': () => load('dev')['free-mixes'],
  'free-mixes-contested': () => load('dev')['free-mixes-contested'],
};

/** Held-out, for RBA-51's one look only: run.ts reaches it past `freeHeldoutRefusal` and the look's log line */
export const freeHeldoutLoaders: Record<FreeSet, () => Track[]> = {
  'free-mixes': () => load('heldout')['free-mixes'],
  'free-mixes-contested': () => load('heldout')['free-mixes-contested'],
};
