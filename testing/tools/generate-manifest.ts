/// <reference types="node" />

import {promises} from 'node:fs';
import {parseFile} from 'music-metadata';

const basePath = 'testing/datasets';

async function setup() {
  console.time('⚡ Generation complete! ⚡');
  const files = await promises.readdir(basePath);

  // Loop through and get bpm from meta-data
  const map = new Map();
  for (const fileName of files.filter(file => !file.startsWith('.') && file !== 'manifest.json')) {
    const filepath = `${basePath}/${fileName}`;
    const metadata = await parseFile(filepath);
    map.set(fileName, metadata.common.bpm);
  }

  await promises.writeFile(`${basePath}/manifest.json`, JSON.stringify(Object.fromEntries(map), null, 2));

  console.timeEnd('⚡ Generation complete! ⚡');
  process.exit(0); // eslint-disable-line unicorn/no-process-exit
}

setup().catch(error => {
  console.error(error);
  process.exit(1); // eslint-disable-line unicorn/no-process-exit
});
