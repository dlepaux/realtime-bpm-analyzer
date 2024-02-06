import * as utils from './tools/utils';
import * as reporter from './tools/bpm-reporter';
import type {Manifest} from './types';

/**
 * Testing the lowpass filter from 50 Hz to 500 Hz
 */
async function setup(): Promise<void> {
  const allLogs: Record<number, {mae: number; rmse: number; accuracy: number}> = {};

  for (let frequencyValue = 50; frequencyValue < 510; frequencyValue += 10) {
    allLogs[frequencyValue] = await test(frequencyValue);
  }

  console.log(allLogs);
}

/**
 * Test all audio files in the manifest.json
 * @param frequencyValue Value in hertz of the lowpass filter
 * @returns The computed statistics on the BPM candidates
 */
async function test(frequencyValue = 200): Promise<{mae: number; rmse: number; accuracy: number}> {
  console.time(`⚡ Test Done ${frequencyValue} ⚡`);

  const response = await fetch('/testing/datasets/manifest.json');
  const json = await response.json() as Manifest;
  const promises = utils.buildPromises(json, {
    frequencyValue,
  });
  const audioFiles = await utils.batchPromises(promises, 10);

  const stats = reporter.log(audioFiles);

  console.timeEnd(`⚡ Test Done ${frequencyValue} ⚡`);

  return stats;
}

/**
 * Tests arn't done in headless mode, so we need to a human gesture to be able to use AudioContext
 */
const button = document.querySelector('#start');
button?.addEventListener('click', () => {
  button.remove();
  setup().catch(error => {
    console.error(error);
  });
});
