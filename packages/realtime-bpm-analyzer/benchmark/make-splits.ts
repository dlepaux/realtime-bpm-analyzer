// Writes benchmark/splits/*.json. Run once, before any result exists. Reading labels is enough:
// the split sees ids, groups and genres, never audio or a score.
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {loaders} from './lib/datasets';
import {assignSplit} from './lib/split';

const seed = 'rba-50-2026-10-30';
const out = process.argv[2];

mkdirSync(out, {recursive: true});

for (const [set, load] of Object.entries(loaders)) {
  const tracks = load().sort((a, b) => (a.id < b.id ? -1 : 1));
  const split = assignSplit(tracks, seed);
  const ids = (side: string) => tracks.filter(track => split.get(track.id) === side).map(track => track.id);

  writeFileSync(join(out, `${set}.json`), `${JSON.stringify({seed, dev: ids('dev'), heldout: ids('heldout')}, null, 0)}\n`);
  console.log(`${set}: ${tracks.length} tracks, ${ids('dev').length} dev, ${ids('heldout').length} held-out`);
}
