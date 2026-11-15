import {expect} from 'chai';
// The function src/index exports, from its own module: the probe needs no worklet, so no build step
import {analyzeFullBuffer, getOfflineLowPassSource} from '../../src/core/offline-pipeline';
import {findPeaks} from '../../src/core/peak-detection';
import {identifyIntervals, groupByTempo, getTopCandidates, resolveTempoRange} from '../../src/core/tempo';
import type {Tempo} from '../../src/core/types';
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
 *
 * RBA-221 fixed peaks with a ladder relative to the file's own level, used only where the fixed ladder finds
 * nothing. Each case also checks that bar: wherever 5.6.1's peaks reads, the whole result is unchanged.
 */

/** 5.6.1's `detectTempo`, verbatim: the fixed ladder alone, as the oracle for readings that must not change */
async function fixedLadderTempos(channelData: Float32Array, sampleRate: number): Promise<Tempo[]> {
  const {peaks} = await findPeaks({audioSampleRate: sampleRate, channelData});
  const intervals = identifyIntervals(peaks);
  const tempos = groupByTempo({audioSampleRate: sampleRate, intervalCounts: intervals, tempoRange: resolveTempoRange()});

  return getTopCandidates(tempos);
}

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

/**
 * The committed fixture has no ground truth, so its variants are graded against its own original reading,
 * which tests level invariance only (RBA-218). A 300 Hz highpass changes what the file holds, not its level:
 * on a 7.7 s clip that peaks reads from at most 8 interval votes, with 125 against the tempogram's 93, the
 * original's top reading is no truth for it. There the original's tempo must still be among the candidates
 * (it is third, after 111 and 112), and the log records the top one.
 */
function isGraded(source: Source, variant: Variant): boolean {
  return source.truth !== null || variant.highpassHz < 300;
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
          const tempos = await analyzeFullBuffer(buffer, {detector: engine});
          const bpm = tempos[0]?.tempo;
          const fixed = await fixedLadderTempos(lowpassed.getChannelData(0), lowpassed.sampleRate);
          const truth = source.truth ?? await analyse(await decodedVariant(source, variants[0]), engine);

          if (truth === undefined) {
            expect.fail(`${source.name} reads no tempo on ${engine} even at its original level`);
          }

          const outcome = classify(bpm, truth);

          console.log(`RBA218 ${JSON.stringify({
            source: source.name, variant: variant.name, engine, truth, bpm: bpm ?? null, outcome,
            readToday: fixed.length > 0,
            peakDb: Number(peakDb(buffer.getChannelData(0)).toFixed(1)),
            lowpassPeakDb: Number(peakDb(lowpassed.getChannelData(0)).toFixed(1)),
          })}`);

          if (fixed.length > 0) {
            expect(tempos, `${source.name}, ${variant.name}: a reading that works in 5.6.1 changed`).to.deep.equal(fixed);
          }

          if (isGraded(source, variant)) {
            expect(outcome, `${source.name}, ${variant.name}, ${engine}: read ${bpm ?? 'nothing'}`).to.equal('correct');
          } else {
            const candidates = tempos.map(tempo => tempo.tempo);
            expect(candidates.some(tempo => classify(tempo, truth) === 'correct'), `${source.name}, ${variant.name}, ${engine}: ${truth} is not among ${candidates.join(', ') || 'no candidates'}`).to.equal(true);
          }
        });
      }
    }
  }
});
