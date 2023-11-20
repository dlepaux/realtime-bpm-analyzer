import { parseFile } from 'music-metadata';
import { promises } from 'fs';

type MusicMap = Record<string, number | undefined>;

export default async (): Promise<MusicMap> => {
  // Read the directory (datasets)
  const files = await promises.readdir('tests/datasets');

  // Loop through and get bpm
  const basePath = 'tests/datasets/';
  const map: MusicMap = {};
  for (const fileName of files) {
    const filepath = `${basePath}${fileName}`;
    const metadata = await parseFile(filepath);
    map[fileName] = metadata.common.bpm;
  }

  // Return FileName & BPM
  return map;
};
