import { parseFile } from 'music-metadata';
import { promises } from 'fs';

const basePath = 'tests/datasets/';

async function setup() {
  // Read the directory (datasets)
  const files = await promises.readdir('tests/datasets');

  // Loop through and get bpm
  const map = new Map();
  for (const fileName of files.filter(file => !file.includes('manifest.json'))) {
    const filepath = `${basePath}${fileName}`;
    const metadata = await parseFile(filepath);
    map.set(fileName, metadata.common.bpm);
  }

  // Write FileName & BPM manifest
  await promises.writeFile(`${basePath}/manifest.json`, JSON.stringify(Object.fromEntries(map), null, 2));
};

setup();
