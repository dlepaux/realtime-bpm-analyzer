import {expect} from 'chai';
import type {OfflineResult} from '../../src/contract/types';
// The function src/index exports, from its own module: the probe needs no worklet, so no build step
import {analyzeFullBuffer, getOfflineLowPassSource} from '../../src/core/offline-pipeline';
import {oracleAnalyzeSamples} from '../lib/peaks-file-path-oracle';
import {
  classify, decodeLikeTheSite, encodeWav, generatedSources, peakDb, renderVariant, sampleRate, variants,
  type Source, type Variant,
} from '../fixtures/quiet-input';

/**
 * RBA-218, the probe for the site's largest loss: most of its file errors are `no_bpm`. Each source is turned down
 * and high-passed, written as a WAV and decoded the way the site's file input does, then read by
 * `analyzeFullBuffer` on the peaks engine. Every variant still has a clear beat, so each must read the tempo it was
 * built at. Before RBA-221 peaks read nothing once the lowpassed bass peaked under its fixed ladder's 0.2 floor.
 *
 * Each case also holds RBA-221's bar: wherever the peaks file path as it stood before (the oracle) reads, the whole
 * reading is unchanged. A reading only the new search finds reports its confidence as null, unmeasured, since the
 * calibration never saw one.
 */

async function fixtureSource(): Promise<Source> {
  const response = await fetch('/tests/fixtures/bass-test.wav');
  const decoded = await new OfflineAudioContext(1, 1, sampleRate).decodeAudioData(await response.arrayBuffer());
  const channels = Array.from({length: decoded.numberOfChannels}, (_, c) => decoded.getChannelData(c));

  return {name: 'bass-test.wav', truth: null, channels};
}

const decodedVariants = new Map<string, Promise<AudioBuffer>>();

/** Each source and variant is rendered and decoded once */
async function decodedVariant(source: Source, variant: Variant): Promise<AudioBuffer> {
  const key = `${source.name}|${variant.name}`;
  let decoded = decodedVariants.get(key);

  if (!decoded) {
    decoded = renderVariant(source, variant).then(async rendered => decodeLikeTheSite(encodeWav(rendered)));
    decodedVariants.set(key, decoded);
  }

  return decoded;
}

async function oracle(buffer: AudioBuffer): Promise<OfflineResult> {
  return oracleAnalyzeSamples(buffer.getChannelData(0), buffer.sampleRate, {engine: 'peaks'}, async lowpass => {
    const filtered = await getOfflineLowPassSource(buffer, lowpass);
    return filtered.getChannelData(0);
  });
}

/**
 * The committed fixture has no ground truth, so its variants are graded against its own original reading, which
 * tests level invariance only (RBA-218). A 300 Hz highpass changes what the file holds, not its level: on a 7.7 s
 * clip that peaks reads from at most 8 interval votes, with 125 against the tempogram's 93, the original's top
 * reading is no truth for it. There the original's tempo must still be among the candidates, and the log records
 * the top one.
 */
function isGraded(source: Source, variant: Variant): boolean {
  return source.truth !== null || variant.highpassHz < 300;
}

describe('RBA-218: a quiet or bass-light file still reads its tempo on peaks', function () {
  // Thirty seconds of audio, read twice
  this.timeout(60_000);

  const sources: Source[] = generatedSources();

  before(async () => {
    sources.push(await fixtureSource());
  });

  // Mocha names the tests before `before` loads the fixture, so the names are listed here
  const names = ['click 120', 'drum loop 124', 'full mix 96', 'bass-test.wav'];

  for (const [index, name] of names.entries()) {
    for (const variant of variants) {
      it(`${name}, ${variant.name}`, async () => {
        const source = sources[index];
        const buffer = await decodedVariant(source, variant);
        const lowpassed = await getOfflineLowPassSource(buffer);
        const reading = await analyzeFullBuffer(buffer, {engine: 'peaks'});
        const before = await oracle(buffer);
        const truth = source.truth ?? (await analyzeFullBuffer(await decodedVariant(source, variants[0]), {engine: 'peaks'}))?.bpm;

        if (truth === undefined) {
          expect.fail(`${source.name} reads no tempo on peaks even at its original level`);
        }

        const outcome = classify(reading?.bpm, truth);
        const status = before === null
          ? (reading === null ? 'no reading' : 'newly read')
          : (JSON.stringify(reading) === JSON.stringify(before) ? 'identical' : 'changed');

        console.log(`RBA221-PROBE ${JSON.stringify({
          source: source.name, variant: variant.name, truth, before: before?.bpm ?? null, bpm: reading?.bpm ?? null,
          candidates: reading?.candidates.map(candidate => candidate.bpm) ?? [], confidence: reading?.confidence ?? null,
          outcome, status,
          peakDb: Number(peakDb(buffer.getChannelData(0)).toFixed(1)),
          lowpassPeakDb: Number(peakDb(lowpassed.getChannelData(0)).toFixed(1)),
        })}`);

        if (before === null) {
          expect(reading?.confidence, `${source.name}, ${variant.name}: a reading only the new search finds is unmeasured`).to.equal(null);
        } else {
          expect(reading, `${source.name}, ${variant.name}: a reading the old path returns changed`).to.deep.equal(before);
        }

        if (isGraded(source, variant)) {
          expect(outcome, `${source.name}, ${variant.name}: read ${reading?.bpm ?? 'nothing'}`).to.equal('correct');
        } else {
          const candidates = reading?.candidates.map(candidate => candidate.bpm) ?? [];
          expect(candidates.some(tempo => classify(tempo, truth) === 'correct'), `${source.name}, ${variant.name}: ${truth} is not among ${candidates.join(', ') || 'no candidates'}`).to.equal(true);
        }
      });
    }
  }
});
