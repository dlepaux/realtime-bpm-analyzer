// Runs the conformance set in Deno against the built library, with Deno's own APIs and the web's
// DecompressionStream, not its Node compatibility layer: `deno run --allow-read conformance/runner/deno.mjs`.
import {analyzeChannelData} from '../../packages/realtime-bpm-analyzer/dist/node.mjs';
import {decodePcm16, runVectors, summary} from './core.mjs';

const root = new URL('../', import.meta.url);

/** @param {URL} url A gzip file @returns {Promise<Uint8Array>} Its content */
async function gunzip(url) {
  const file = await Deno.open(url);
  return new Uint8Array(await new Response(file.readable.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
}

const vectors = JSON.parse(await Deno.readTextFile(new URL('vectors.json', root)));
const result = await runVectors({
  vectors,
  loadSamples: async input => decodePcm16(await gunzip(new URL(input.file, root))),
  analyze: analyzeChannelData,
  log: console.log,
});
console.log(summary(`Deno ${Deno.version.deno}`, result));
Deno.exit(result.failed === 0 && result.passed > 0 ? 0 : 1);
