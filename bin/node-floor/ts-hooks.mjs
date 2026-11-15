// The load hook register-ts.mjs installs: strips a .ts file's types with esbuild (a root
// devDependency), as Node's own stripping would.
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';

export async function load(url, context, nextLoad) {
  if (!url.startsWith('file:') || !url.endsWith('.ts')) {
    return nextLoad(url, context);
  }

  const source = await readFile(new URL(url), 'utf8');
  const {code} = await transform(source, {loader: 'ts', format: 'esm', sourcefile: url});
  return {format: 'module', source: code, shortCircuit: true};
}
