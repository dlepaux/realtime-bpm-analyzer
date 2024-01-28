import {analyzeFullBuffer} from '../src/analyzer';

async function runTests() {
  const audioContext = new OfflineAudioContext(2, 44100 * 40, 44100);
  const response = await fetch('/tests/datasets/manifest.json');
  const json: Record<string, number> = await response.json(); // eslint-disable-line @typescript-eslint/no-unsafe-assignment
  for (const fileName of Object.keys(json)) {
    const bpm = json[fileName];
    const response = await fetch(`/tests/datasets/${fileName}`);
    const buffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(buffer);
    const tempo = await analyzeFullBuffer(audioBuffer);
    console.assert(tempo[0].tempo === bpm, 'The computed tempo is not matching');
  }
}

runTests(); // eslint-disable-line @typescript-eslint/no-floating-promises
