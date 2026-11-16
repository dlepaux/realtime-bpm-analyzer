// Runs the conformance set in Bun against the built library, with Bun's own file and gzip APIs:
// `bun conformance/runner/bun.mjs`.
import {analyzeChannelData} from '../../packages/realtime-bpm-analyzer/dist/node.mjs';
import {decodePcm16, runVectors, summary} from './core.mjs';

const root = new URL('../', import.meta.url);
const vectors = await Bun.file(new URL('vectors.json', root)).json();
const result = await runVectors({
  vectors,
  loadSamples: async input => decodePcm16(Bun.gunzipSync(await Bun.file(new URL(input.file, root)).bytes())),
  analyze: analyzeChannelData,
  log: console.log,
});
console.log(summary(`Bun ${Bun.version}`, result));
process.exit(result.failed === 0 && result.passed > 0 ? 0 : 1);
