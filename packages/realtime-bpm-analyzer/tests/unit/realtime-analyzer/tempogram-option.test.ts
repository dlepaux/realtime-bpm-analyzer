import {expect} from 'chai';
import {RealTimeBpmAnalyzer} from '../../../src/core/realtime-bpm-analyzer';
import type {ProcessorOutputEvent} from '../../../src/core/types';
import {createClickTrack} from '../../fixtures/click-track';

const sampleRate = 44_100;

async function stream(analyzer: RealTimeBpmAnalyzer, pcm: Float32Array): Promise<ProcessorOutputEvent[]> {
  const events: ProcessorOutputEvent[] = [];

  for (let start = 0; start + 4096 <= pcm.length; start += 4096) {
    await analyzer.analyzeChunk({
      audioSampleRate: sampleRate,
      channelData: pcm.subarray(start, start + 4096),
      bufferSize: 4096,
      postMessage: event => {
        events.push(event);
      },
    });
  }

  return events;
}

describe('detector option', () => {
  it('defaults to the peaks detector', () => {
    expect(new RealTimeBpmAnalyzer().options.detector).to.equal('peaks');
  });

  it('refuses an unknown detector', () => {
    // @ts-expect-error Invalid on purpose
    expect(() => new RealTimeBpmAnalyzer({detector: 'magic'})).to.throw(RangeError);
  });

  it('emits the same event types with the tempogram', async () => {
    const events = await stream(new RealTimeBpmAnalyzer({detector: 'tempogram'}), createClickTrack(128, sampleRate, 20));
    const bpm = events.filter(event => event.type === 'bpm');
    const stable = events.filter(event => event.type === 'bpmStable');
    const progress = events.flatMap(event => (event.type === 'progress' ? [event.data] : []));

    expect(bpm.length).to.be.greaterThan(10);
    expect(stable.length).to.equal(1);
    expect(progress[0].peaks).to.equal(0);
    expect(progress.at(-1)).to.deep.equal({peaks: 16, requiredPeaks: 16});
  });

  it('starts over with continuous analysis', async () => {
    const analyzer = new RealTimeBpmAnalyzer({detector: 'tempogram', continuousAnalysis: true, stabilizationTime: 5000});
    const events = await stream(analyzer, createClickTrack(128, sampleRate, 7));
    const resetAt = events.findIndex(event => event.type === 'analyzerReset');

    expect(resetAt).to.be.greaterThan(-1);
    expect(events[resetAt + 1]).to.deep.equal({type: 'progress', data: {peaks: 0, requiredPeaks: 16}});
  });

  it('leaves the peaks detector untouched', async () => {
    const pcm = createClickTrack(128, sampleRate, 20);
    const events = await stream(new RealTimeBpmAnalyzer(), pcm);
    const last = events.filter(event => event.type === 'bpm').at(-1);

    expect(last?.type === 'bpm' && last.data.bpm[0].tempo).to.equal(128);
  });
});
