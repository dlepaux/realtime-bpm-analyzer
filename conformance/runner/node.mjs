// Runs the conformance set in Node against the built library: `node conformance/runner/node.mjs`, after the build.
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {analyzeChannelData} from '../../packages/realtime-bpm-analyzer/dist/node.mjs';
import {decodePcm16, runVectors, summary} from './core.mjs';

const root = new URL('../', import.meta.url);
const vectors = JSON.parse(await readFile(new URL('vectors.json', root), 'utf8'));
const result = await runVectors({
  vectors,
  loadSamples: async input => decodePcm16(gunzipSync(await readFile(new URL(input.file, root)))),
  analyze: analyzeChannelData,
  log: console.log,
});
console.log(summary(`Node ${process.version}`, result));
process.exitCode = result.failed === 0 && result.passed > 0 ? 0 : 1;
