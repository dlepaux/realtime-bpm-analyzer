/// <reference types="node" />

import {promises} from 'node:fs';
import * as esbuild from 'esbuild';
import type {BuildOptions} from 'esbuild/lib/main';

const commonConfig = {
  bundle: true,
  sourcemap: true,
  minify: false,
  metafile: true,
};

const outdir = 'dist';

async function main() {
  const processorConfig: BuildOptions = {
    entryPoints: ['src/processor/realtime-bpm-processor.ts'],
    outfile: `${outdir}/realtime-bpm-processor.js`,
    ...commonConfig,
    // Published as `realtime-bpm-analyzer/processor` for callers that load it by URL (strict CSP,
    // MV3 extensions). addModule always evaluates a module, so emit ESM; bundling leaves no imports.
    format: 'esm',
  };

  // Generate JS Builds
  console.time('⚡ Build complete! ⚡');

  await esbuild.build(processorConfig);

  let processor: string;
  try {
    processor = await promises.readFile(
      './dist/realtime-bpm-processor.js',
      'utf8',
    );
  } catch (error: unknown) {
    // Inlining nothing would publish a package whose worklet silently does nothing
    throw new Error('Processor bundle missing: dist/realtime-bpm-processor.js could not be read', {cause: error});
  }

  // Generate processor file inlined.
  // Typed `string` stops tsc from baking the full content into a literal type in the emitted .d.ts.
  // JSON.stringify escapes the bundle: raw inlining in a template literal broke on any
  // backtick, `${` or backslash in worklet code (template strings, escaped characters).
  const generatedProcessor = [
    'const realtimeBpmProcessor: string = ',
    JSON.stringify(processor),
    ';\nexport default realtimeBpmProcessor;\n',
  ].join('');
  await promises.writeFile(
    'src/generated-processor.ts',
    generatedProcessor,
    'utf8',
  );

  const esbuildEsmConfig: BuildOptions = {
    entryPoints: ['src/index.ts'],
    outfile: `${outdir}/index.esm.js`,
    ...commonConfig,
    platform: 'neutral',
    format: 'esm',
  };

  const esbuildConfig = Object.assign({}, esbuildEsmConfig);
  delete esbuildConfig.platform;
  delete esbuildConfig.format;
  esbuildConfig.outfile = `${outdir}/index.js`;
  esbuildConfig.format = 'cjs';

  await esbuild.build(esbuildEsmConfig);
  await esbuild.build(esbuildConfig);

  // `realtime-bpm-analyzer/node`: explicit .mjs/.cjs extensions, because the package has no
  // "type" field and Node would otherwise read a .js ESM bundle as CommonJS.
  const nodeConfig: BuildOptions = {
    entryPoints: ['src/node.ts'],
    ...commonConfig,
    platform: 'node',
    target: 'node18',
  };
  await esbuild.build({...nodeConfig, outfile: `${outdir}/node.mjs`, format: 'esm'});
  await esbuild.build({...nodeConfig, outfile: `${outdir}/node.cjs`, format: 'cjs'});

  // The `realtime-bpm-analyzer` bin. The decoders stay external: they are optional
  // dependencies loaded at run time, and no other entry imports them.
  await esbuild.build({
    ...nodeConfig,
    entryPoints: ['src/cli.ts'],
    outfile: `${outdir}/cli.mjs`,
    format: 'esm',
    external: ['@audio/*'],
    banner: {js: '#!/usr/bin/env node'},
  });

  console.timeEnd('⚡ Build complete! ⚡');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
