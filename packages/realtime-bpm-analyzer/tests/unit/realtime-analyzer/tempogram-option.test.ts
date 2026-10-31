import {expect} from 'chai';
import {RealTimeBpmAnalyzer} from '../../../src/core/realtime-bpm-analyzer';
import {createTempogramDetector} from '../../../src/core/tempogram';
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

describe('tempogramMode', () => {
  const extension = {detector: 'tempogram', tempogramMode: 'extension'} as const;

  it('reads as the candidate RBA-51 measured', async () => {
    const pcm = createClickTrack(128, sampleRate, 20);
    const measured = new RealTimeBpmAnalyzer({detector: 'tempogram', tempoRange: {min: 90, max: 180}});

    measured.tempogram = createTempogramDetector({sampleRate, tempoRange: {min: 90, max: 180}, tuning: {priorBpm: 80, priorOctaves: 1.7, thirdBeatPenalty: 0.3}});

    expect(await stream(new RealTimeBpmAnalyzer(extension), pcm)).to.deep.equal(await stream(measured, pcm));
  });

  it('searches 90 to 180 BPM, so a fast pulse cannot read at half', async () => {
    const events = await stream(new RealTimeBpmAnalyzer(extension), createClickTrack(170, sampleRate, 20));
    const readings = events.flatMap(event => (event.type === 'bpm' ? [event.data.bpm[0].tempo] : []));

    expect(readings.at(-1)).to.be.within(165, 175);
  });

  it('accepts its own range, and refuses another, a reset timer, or another detector', () => {
    expect(() => new RealTimeBpmAnalyzer({...extension, tempoRange: {min: 90, max: 180}})).to.not.throw();
    expect(() => new RealTimeBpmAnalyzer({...extension, tempoRange: {min: 50, max: 240}})).to.throw(RangeError, 'another range');
    expect(() => new RealTimeBpmAnalyzer({...extension, continuousAnalysis: true})).to.throw(RangeError, 'continuousAnalysis');
    expect(() => new RealTimeBpmAnalyzer({tempogramMode: 'extension'})).to.throw(RangeError, 'needs detector');
    // @ts-expect-error Invalid on purpose
    expect(() => new RealTimeBpmAnalyzer({detector: 'tempogram', tempogramMode: 'magic'})).to.throw(RangeError, 'Invalid tempogramMode');
  });

  it('changes nothing for a tempogram that does not ask', () => {
    expect(new RealTimeBpmAnalyzer({detector: 'tempogram'}).tempogramSettings).to.deep.equal({tempoRange: undefined});
  });
});

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
