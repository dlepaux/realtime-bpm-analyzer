import {expect} from 'chai';
// The function src/index exports, from its own module: the probe needs no worklet, so no build step
import {analyzeFullBuffer, getOfflineLowPassSource} from '../../src/core/offline-pipeline';
import {
  classify, decodeLikeTheSite, encodeWav, generatedSources, peakDb, renderVariant, sampleRate, variants,
  type Source, type Variant,
} from '../fixtures/quiet-input';

/**
 * RBA-218, the probe for the site's largest loss: 71% of file errors are `no_bpm`. Each source is turned
 * down and high-passed, written as a WAV and decoded the way the site's file input does
 * (BpmHeroTool.vue), then read by analyzeFullBuffer on each engine. Every variant still has a clear beat,
 * so each must read the tempo it was built at: these fail today wherever the detector depends on the
 * input level or on the bass, and they are the fix's first red tests.
 */

// 5.x: the tempogram is opt-in and level-relative already (RBA-218), so only the default detector is pinned
type Engine = 'peaks';

const engines: readonly Engine[] = ['peaks'];

async function fixtureSource(): Promise<Source> {
  const response = await fetch('/tests/fixtures/bass-test.wav');
  const decoded = await new OfflineAudioContext(1, 1, sampleRate).decodeAudioData(await response.arrayBuffer());
  const channels = Array.from({length: decoded.numberOfChannels}, (_, c) => decoded.getChannelData(c));

  return {name: 'bass-test.wav', truth: null, channels};
}

const decodedVariants = new Map<string, Promise<AudioBuffer>>();

/** Each source and variant is rendered and decoded once, then read by every engine */
async function decodedVariant(source: Source, variant: Variant): Promise<AudioBuffer> {
  const key = `${source.name}|${variant.name}`;
  let decoded = decodedVariants.get(key);

  if (!decoded) {
    decoded = renderVariant(source, variant).then(async rendered => decodeLikeTheSite(encodeWav(rendered)));
    decodedVariants.set(key, decoded);
  }

  return decoded;
}

async function analyse(buffer: AudioBuffer, engine: Engine): Promise<number | undefined> {
  const tempos = await analyzeFullBuffer(buffer, {detector: engine});
  return tempos[0]?.tempo;
}

describe('RBA-218: a quiet or bass-light file still reads its tempo', function () {
  // Thirty seconds of audio per run
  this.timeout(60_000);

  const sources: Source[] = generatedSources();

  before(async () => {
    sources.push(await fixtureSource());
  });

  // Mocha names the tests before `before` loads the fixture, so the names are listed here
  const names = ['click 120', 'drum loop 124', 'full mix 96', 'bass-test.wav'];

  for (const [index, name] of names.entries()) {
    for (const variant of variants) {
      for (const engine of engines) {
        it(`${name}, ${variant.name}, ${engine}`, async () => {
          const source = sources[index];
          const buffer = await decodedVariant(source, variant);
          const lowpassed = await getOfflineLowPassSource(buffer);
          const bpm = await analyse(buffer, engine);
          const truth = source.truth ?? await analyse(await decodedVariant(source, variants[0]), engine);

          if (truth === undefined) {
            expect.fail(`${source.name} reads no tempo on ${engine} even at its original level`);
          }

          const outcome = classify(bpm, truth);

          console.log(`RBA218 ${JSON.stringify({
            source: source.name, variant: variant.name, engine, truth, bpm: bpm ?? null, outcome,
            peakDb: Number(peakDb(buffer.getChannelData(0)).toFixed(1)),
            lowpassPeakDb: Number(peakDb(lowpassed.getChannelData(0)).toFixed(1)),
          })}`);

          expect(outcome, `${source.name}, ${variant.name}, ${engine}: read ${bpm ?? 'nothing'}`).to.equal('correct');
        });
      }
    }
  }
});
