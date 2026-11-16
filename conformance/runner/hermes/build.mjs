// Bundles the conformance run into one script for Hermes's shell: `node conformance/runner/hermes/build.mjs <out.js>`,
// after the library's build. The vectors and the decoded PCM go in as data, since the shell reads no files.
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {build} from 'esbuild';

const out = process.argv[2];
if (!out) {
  throw new Error('Usage: node conformance/runner/hermes/build.mjs <out.js>');
}

const root = new URL('../../', import.meta.url);
const vectors = JSON.parse(readFileSync(new URL('vectors.json', root), 'utf8'));
const pcm = Object.fromEntries(vectors.inputs.map(input => [input.id, gunzipSync(readFileSync(new URL(input.file, root))).toString('base64')]));

await build({
  entryPoints: [new URL('entry.mjs', import.meta.url).pathname],
  outfile: out,
  bundle: true,
  format: 'iife',
  // An app's code reaches Hermes through React Native's Babel preset, which lowers async functions to generators.
  // es2016 does the same here, so the run sees the library as an app ships it.
  target: 'es2016',
  logLevel: 'warning',
  plugins: [{
    name: 'conformance-data',
    setup(context) {
      context.onResolve({filter: /^conformance-data$/}, () => ({path: 'conformance-data', namespace: 'conformance-data'}));
      context.onLoad({filter: /.*/, namespace: 'conformance-data'}, () => ({
        contents: `export const vectors = ${JSON.stringify(vectors)};\nexport const pcm = ${JSON.stringify(pcm)};\n`,
        loader: 'js',
      }));
    },
  }],
});
console.log(`wrote ${out}`);
