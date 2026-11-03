import {expect} from 'chai';
import {installWorkletShim} from '../../../benchmark/browser-cost/page-shim';
import {percentile, quantumBudgetMs, summarise, ofKinds} from '../../../benchmark/browser-cost/stats';
import {drumMix} from '../../../benchmark/browser-cost/signal';
import {quantumKind, timedProcessor} from '../../../benchmark/browser-cost/timed-processor';

describe('browser cost harness', () => {
  it('reads nearest-rank percentiles and the quantum budget', () => {
    const values = Float64Array.from({length: 100}, (_, i) => i + 1);

    expect(percentile(values, 0.5)).to.equal(50);
    expect(percentile(values, 0.99)).to.equal(99);
    expect(percentile(values, 1)).to.equal(100);
    expect(quantumBudgetMs(48_000)).to.be.closeTo(2.6667, 1e-4);
  });

  it('summarises only the filled slots, and per kind', () => {
    const values = Float64Array.from([3, 1, 2, 99]);

    expect(summarise(values, 3)).to.deep.equal({count: 3, mean: 2, p50: 2, p95: 3, p99: 3, max: 3});
    expect(summarise(values, 0)).to.equal(null);
    expect([...ofKinds(values, [0, 1, 0, 1], 3, [1])]).to.deep.equal([1]);
  });

  it('generates the same clip every time', () => {
    const a = drumMix(8000, 2);

    expect(a.length).to.equal(16_000);
    expect(a).to.deep.equal(drumMix(8000, 2));
    expect(Math.max(...a.map(Math.abs))).to.be.within(0.1, 1);
  });

  it('times every quantum and every analysis of the real processor, without changing what it posts', async () => {
    installWorkletShim();
    (globalThis as unknown as {sampleRate: number}).sampleRate = 8000;

    const {RealTimeBpmProcessor} = await import('../../../src/processor/realtime-bpm-processor');

    let tick = 0;
    const Timed = timedProcessor(RealTimeBpmProcessor, () => tick++, 'counter');
    const processor = new Timed({numberOfInputs: 1, numberOfOutputs: 1, processorOptions: {detector: 'tempogram'}});
    const pcm = drumMix(8000, 12);
    const quanta = Math.floor(pcm.length / 128);

    for (let q = 0; q < quanta; q += 1) {
      processor.process([[pcm.subarray(q * 128, (q + 1) * 128)]], [[new Float32Array(128)]], {});

      if (processor.pending) {
        await processor.pending;
        processor.pending = null;
        await Promise.resolve();
        await Promise.resolve();
      }
    }

    const dump = processor.dump();
    const analysisQuanta = [...dump.kinds].filter(kind => kind !== quantumKind.plain).length;

    expect(dump.quanta).to.equal(quanta);
    expect(dump.analyses).to.equal(Math.floor((quanta * 128) / 4096));
    expect(analysisQuanta).to.equal(dump.analyses);
    expect([...dump.kinds]).to.include(quantumKind.reading);
    expect(dump.spilled).to.equal(0);
    expect(dump.errors).to.equal(0);
    expect(dump.lastBpm).to.be.a('number');
    // 12 s of audio fill the first minute only, and it holds every millisecond counted
    expect(dump.minuteMs).to.have.length(1);
    expect(dump.minuteMs[0]).to.equal(dump.totalMs);
    // A plain quantum reads the clock twice, so it costs exactly one tick
    expect(dump.costs[0]).to.equal(1);
  });
});
