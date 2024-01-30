import * as utils from './tools/utils';
import * as reporter from './tools/bpm-reporter';
import type {Manifest} from './types';

async function setup(): Promise<void> {
  console.time('⚡ Testing Done ⚡');

  const audioContext = new OfflineAudioContext(2, 44100 * 40, 44100);
  const response = await fetch('/testing/datasets/manifest.json');
  const json = await response.json() as Manifest;
  const promises = utils.buildPromises(json, audioContext);
  const audioFiles = await utils.batchPromises(promises, 10);

  reporter.log(audioFiles);

  console.timeEnd('⚡ Testing Done ⚡');
}

setup().catch(error => {
  console.error(error);
});
