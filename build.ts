/// <reference types="node" />

import {promises} from 'node:fs';
import * as esbuild from 'esbuild';
import type {BuildOptions} from 'esbuild/lib/main';

const commonConfig = {
  bundle: true,
  sourcemap: true,
  minify: true,
  metafile: true,
};

const outdir = 'dist';

async function main() {
  const processorConfig: BuildOptions = {
    entryPoints: [
      'processor/realtime-bpm-processor.ts',
    ],
    outfile: `${outdir}/realtime-bpm-processor.js`,
    ...commonConfig,
  };

  // Generate JS Builds
  console.time('⚡ Build complete! ⚡');

  await esbuild.build(processorConfig);

  let processor: string | undefined;
  try {
    processor = await promises.readFile('./dist/realtime-bpm-processor.js', 'utf8');
  } catch (error: unknown) {
    console.warn(error);
    console.warn('NO PROCESSOR BUILT !');
  }

  // Generate processor file inlined
  const generatedProcessor = ['export default `', processor, '`;\n'].join('');
  await promises.writeFile('src/generated-processor.ts', generatedProcessor, 'utf8');

  const esbuildEsmConfig: BuildOptions = {
    entryPoints: ['src/index.ts'],
    outfile: `${outdir}/index.esm.js`,
    ...commonConfig,
    platform: 'neutral',
  };

  const esbuildConfig = Object.assign({}, esbuildEsmConfig);
  delete esbuildConfig.platform;
  esbuildConfig.outfile = `${outdir}/index.js`;

  await esbuild.build(esbuildEsmConfig);
  await esbuild.build(esbuildConfig);

  console.timeEnd('⚡ Build complete! ⚡');
}

main().catch(error => {
  console.error(error);
});
