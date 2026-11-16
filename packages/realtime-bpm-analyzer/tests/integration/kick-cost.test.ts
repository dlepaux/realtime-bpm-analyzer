import {expect} from 'chai';
import {createKickDetector} from '../../src/core/kick-detector';
import {createKickScene} from '../fixtures/kick-scenes';
import {loadProcessorModule, processorOptions} from '../unit/processor/worklet-stub';

const quantum = 128;
const sampleRate = 48_000;

/**
 * What the kick event costs, in this browser (RBA-243). It replays the same quanta through the library's own
 * processor with the kick detector on and off, as RBA-51's main-thread replay does
 * (`benchmark/results/rba-51-browser-cost.md`): `performance.now()` is too coarse inside the worklet. Each mode runs
 * three times, alternating, and the fastest run counts, so a runner's hiccup does not count against either.
 *
 * Logged as `KICK-COST` for the report. The one assertion is loose, so the test measures the code and not the
 * runner: the kick detector may add at most 1% of the real-time budget, that is 10 ms of CPU per second of audio,
 * the whole tempogram's sustained share on CI (RBA-51).
 */
describe('Kick event - CPU cost', function () {
  this.timeout(120_000);

  let RealTimeBpmProcessor: any;

  before(async () => {
    RealTimeBpmProcessor = (await loadProcessorModule(sampleRate)).RealTimeBpmProcessor;
  });

  /** A detector that hears nothing and costs nothing: the processor as it was before the kick event */
  const off = {process() {/* Off */}, reset() {/* Off */}};

  async function replay(samples: Float32Array, kicks: boolean): Promise<number> {
    const processor = new RealTimeBpmProcessor({numberOfInputs: 1, numberOfOutputs: 1, processorOptions: processorOptions()});
    if (!kicks) {
      processor.kickDetector = off;
    }

    const chunk = new Float32Array(quantum);
    let spent = 0;
    for (let start = 0; start + quantum <= samples.length; start += quantum) {
      (globalThis as any).currentTime = start / sampleRate;
      chunk.set(samples.subarray(start, start + quantum));
      const begin = performance.now();
      processor.process([[chunk]], [[]], {});
      // The analysis settles in the microtasks after its quantum, as in the worklet: it is charged to that quantum
      for (let i = 0; i < 4; i += 1) {
        await Promise.resolve();
      }

      spent += performance.now() - begin;
    }

    return spent;
  }

  it('adds under 1% of the real-time budget to the processor', async () => {
    const samples = createKickScene('full-mix', sampleRate).samples;
    const audioSeconds = samples.length / sampleRate;
    const runs = {on: [] as number[], off: [] as number[]};
    for (let round = 0; round < 3; round += 1) {
      runs.on.push(await replay(samples, true));
      runs.off.push(await replay(samples, false));
    }

    // The detector alone, without the processor around it
    const detector = createKickDetector(sampleRate);
    const ignore = () => undefined;
    const detectorRuns: number[] = [];
    for (let round = 0; round < 3; round += 1) {
      const begin = performance.now();
      for (let start = 0; start + quantum <= samples.length; start += quantum) {
        detector.process(samples.subarray(start, start + quantum), start / sampleRate, ignore);
      }

      detectorRuns.push(performance.now() - begin);
    }

    const perSecond = (ms: number) => Number((ms / audioSeconds).toFixed(3));
    const on = Math.min(...runs.on);
    const without = Math.min(...runs.off);
    const alone = Math.min(...detectorRuns);
    const quantumMs = (quantum / sampleRate) * 1000;
    const quanta = Math.floor(samples.length / quantum);
    console.log(`KICK-COST ${JSON.stringify({
      browser: navigator.userAgent,
      crossOriginIsolated: globalThis.crossOriginIsolated,
      audioSeconds,
      msPerAudioSecond: {processorWithKicks: perSecond(on), processorWithout: perSecond(without), added: perSecond(on - without), detectorAlone: perSecond(alone)},
      shareOfRealTime: {withKicks: Number((on / audioSeconds / 10).toFixed(3)), without: Number((without / audioSeconds / 10).toFixed(3)), detectorAlone: Number((alone / audioSeconds / 10).toFixed(3))},
      meanQuantumUs: {withKicks: Number(((on / quanta) * 1000).toFixed(2)), without: Number(((without / quanta) * 1000).toFixed(2)), budget: Number((quantumMs * 1000).toFixed(1))},
    })}`);

    // The detector alone is the cleanest reading of what it adds: the difference of two runs carries their noise
    expect(alone / audioSeconds, 'ms of CPU per second of audio').to.be.below(10);
  });
});
