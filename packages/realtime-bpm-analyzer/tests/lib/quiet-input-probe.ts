import {expect} from 'chai';
import type {OfflineResult} from '../../src/contract/types';
// The function src/index exports, from its own module: the probe needs no worklet, so no build step
import {analyzeFullBuffer, getOfflineLowPassSource} from '../../src/core/offline-pipeline';
import {oracleAnalyzeSamples} from './peaks-file-path-oracle';
import {
  classify, decodeLikeTheSite, encodeWav, generatedSource, peakDb, renderVariant, variants,
  type Source, type Variant,
} from '../fixtures/quiet-input';

/**
 * The probe for the site's largest loss: most of its file errors are `no_bpm`. Each source is turned down
 * and high-passed, written as a WAV and decoded the way the site's file input does, then read by
 * `analyzeFullBuffer` on the peaks engine. Every variant still has a clear beat, so each must read the tempo it was
 * built at. Before the level-relative search, peaks read nothing once the lowpassed bass peaked under its fixed ladder's 0.2 floor.
 *
 * Each case also holds the level-relative search's bar: wherever the peaks file path as it stood before (the oracle) reads, the whole
 * reading is unchanged. A reading only the new search finds reports its confidence as null, unmeasured, since the
 * calibration never saw one.
 *
 * One file per source under tests/integration/quiet-input: the Firefox run gives each file 60 s
 * (`testsFinishTimeout`), and on CI the four sources together took longer than that.
 */

async function oracle(buffer: AudioBuffer): Promise<OfflineResult> {
  return oracleAnalyzeSamples(buffer.getChannelData(0), buffer.sampleRate, {engine: 'peaks'}, async lowpass => {
    const filtered = await getOfflineLowPassSource(buffer, lowpass);
    return filtered.getChannelData(0);
  });
}

/**
 * The committed fixture has no ground truth, so its variants are graded against its own original reading, which
 * tests level invariance only. A 300 Hz highpass changes what the file holds, not its level: on a 7.7 s
 * clip that peaks reads from at most 8 interval votes, with 125 against the tempogram's 93, the original's top
 * reading is no truth for it. There the original's tempo must still be among the candidates, and the log records
 * the top one.
 */
function isGraded(source: Source, variant: Variant): boolean {
  return source.truth !== null || variant.highpassHz < 300;
}

/**
 * Runs every variant of one source: by default the generated one of that name, else what `load` returns, once.
 * Mocha names the tests before `load` runs, so the name is given.
 */
export function probeQuietInput(name: string, load: () => Source | Promise<Source> = () => generatedSource(name)): void {
  describe(`a quiet or bass-light file still reads its tempo on peaks, ${name}`, function () {
    // Thirty seconds of audio, read twice
    this.timeout(60_000);

    let source: Source;
    let truth: number | undefined;
    const decoded = new Map<Variant, Promise<AudioBuffer>>();

    /** Each variant is rendered and decoded once */
    async function decodedVariant(variant: Variant): Promise<AudioBuffer> {
      let buffer = decoded.get(variant);

      if (!buffer) {
        buffer = renderVariant(source, variant).then(async rendered => decodeLikeTheSite(encodeWav(rendered)));
        decoded.set(variant, buffer);
      }

      return buffer;
    }

    before(async () => {
      source = await load();
      expect(source.name).to.equal(name);
      truth = source.truth ?? (await analyzeFullBuffer(await decodedVariant(variants[0]), {engine: 'peaks'}))?.bpm;
    });

    for (const variant of variants) {
      it(`${name}, ${variant.name}`, async () => {
        const expected = truth;

        if (expected === undefined) {
          expect.fail(`${source.name} reads no tempo on peaks even at its original level`);
        }

        const buffer = await decodedVariant(variant);
        const lowpassed = await getOfflineLowPassSource(buffer);
        const reading = await analyzeFullBuffer(buffer, {engine: 'peaks'});
        const before = await oracle(buffer);
        const outcome = classify(reading?.bpm, expected);
        const status = before === null
          ? (reading === null ? 'no reading' : 'newly read')
          : (JSON.stringify(reading) === JSON.stringify(before) ? 'identical' : 'changed');

        console.log(`RBA221-PROBE ${JSON.stringify({
          source: source.name, variant: variant.name, truth: expected, before: before?.bpm ?? null, bpm: reading?.bpm ?? null,
          candidates: reading?.candidates.map(candidate => candidate.bpm) ?? [], confidence: reading?.confidence ?? null,
          outcome, status,
          peakDb: Number(peakDb(buffer.getChannelData(0)).toFixed(1)),
          lowpassPeakDb: Number(peakDb(lowpassed.getChannelData(0)).toFixed(1)),
        })}`);

        if (before !== null) {
          expect(reading, `${source.name}, ${variant.name}: a reading the old path returns changed`).to.deep.equal(before);
        } else if (reading !== null) {
          expect(reading.confidence, `${source.name}, ${variant.name}: a reading only the new search finds is unmeasured`).to.equal(null);
        }

        if (isGraded(source, variant)) {
          expect(outcome, `${source.name}, ${variant.name}: read ${reading?.bpm ?? 'nothing'}`).to.equal('correct');
        } else {
          const candidates = reading?.candidates.map(candidate => candidate.bpm) ?? [];
          expect(candidates.some(tempo => classify(tempo, expected) === 'correct'), `${source.name}, ${variant.name}: ${expected} is not among ${candidates.join(', ') || 'no candidates'}`).to.equal(true);
        }
      });
    }
  });
}
