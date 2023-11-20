import datasetReader from './dataset-reader';
import {analyzeFullBuffer} from '../src/index';
import {promises} from 'fs';

/**
 * Mass tests onto a dataset of music files
 */
describe('Mass tests', () => {
  it('should assert a serie of music files', async () => {
    const musicFiles = await datasetReader();

    for (const fileName of Object.keys(musicFiles)) {
        const bpm = musicFiles[fileName];

        const basePath = 'tests/datasets/';
        const buffer = await promises.readFile(`${basePath}${fileName}`);

        analyzeFullBuffer(buffer);
    }
  });
});
