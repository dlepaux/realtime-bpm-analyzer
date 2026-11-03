import {expect} from 'chai';
import {RealTimeBpmAnalyzer} from '../../../src/core/realtime-bpm-analyzer';
import {minValidThreshold, stableWarmUpSeconds} from '../../../src/core/consts';
import {createClickTrack} from '../../fixtures/click-track';
import type {ProcessorOutputEvent, RealTimeBpmAnalyzerParameters} from '../../../src/core/types';

const bufferSize = 4096;
const audioSampleRate = 44_100;

type Heard = {event: ProcessorOutputEvent; at: number};

/**
 * Feed samples to a fresh analyzer chunk by chunk, and note each event with the seconds heard so far
 */
async function listen(samples: Float32Array, options: RealTimeBpmAnalyzerParameters = {}): Promise<Heard[]> {
  const analyzer = new RealTimeBpmAnalyzer(options);
  const heard: Heard[] = [];

  for (let start = 0; start + bufferSize <= samples.length; start += bufferSize) {
    const at = (start + bufferSize) / audioSampleRate;

    await analyzer.analyzeChunk({
      audioSampleRate,
      channelData: samples.subarray(start, start + bufferSize),
      bufferSize,
      postMessage: event => heard.push({event, at}),
    });
  }

  return heard;
}

/**
 * A click track whose clicks get louder every few seconds, so higher thresholds fill one after another
 */
function swellingClicks(seconds: number): Float32Array {
  const samples = createClickTrack(120, audioSampleRate, seconds);

  for (let i = 0; i < samples.length; i++) {
    samples[i] *= Math.min(1, 0.4 + (0.06 * Math.floor(i / audioSampleRate / 2)));
  }

  return samples;
}

describe('RealTimeBpmAnalyzer - peaks bpmStable waits for the warm-up (RBA-107)', () => {
  it('locks above the lowest threshold well before the warm-up, yet announces nothing stable until it', async () => {
    const heard = await listen(createClickTrack(120, audioSampleRate, 15));
    const firstLock = heard.find(({event}) => event.type === 'bpm' && event.data.bpm.length > 0 && event.data.threshold > minValidThreshold);
    const stable = heard.filter(({event}) => event.type === 'bpmStable');

    expect(firstLock, 'a lock above the lowest threshold').to.not.equal(undefined);
    expect(firstLock!.at).to.be.below(stableWarmUpSeconds);
    expect(stable.length).to.be.greaterThan(0);
    expect(stable[0].at).to.be.at.least(stableWarmUpSeconds);
  });

  it('announces a lock held since early on as soon as the warm-up ends, even on the top threshold', async () => {
    // Clicks loud enough to fill the top threshold first: no higher one is left to fill after the warm-up
    const loud = createClickTrack(120, audioSampleRate, 15).map(sample => sample * 1.2);
    const heard = await listen(loud);
    const stable = heard.flatMap(({event, at}) => (event.type === 'bpmStable' ? [{at, data: event.data}] : []));

    expect(stable).to.have.length(1);
    expect(stable[0].data.threshold).to.equal(0.9);
    expect(stable[0].at).to.be.below(stableWarmUpSeconds + (bufferSize / audioSampleRate));
    expect(stable[0].data.bpm[0].tempo).to.equal(120);
  });

  it('still announces each higher threshold that fills after the warm-up', async () => {
    const heard = await listen(swellingClicks(30));
    const thresholds = heard.flatMap(({event}) => (event.type === 'bpmStable' ? [event.data.threshold] : []));

    expect(thresholds.length).to.be.greaterThan(1);
    for (let i = 1; i < thresholds.length; i++) {
      expect(thresholds[i]).to.be.greaterThan(thresholds[i - 1]);
    }
  });

  it('in continuous analysis, waits only as long as a shorter stabilizationTime, so stable comes before the reset', async () => {
    // The first lock comes at about 7.5 s, and the reset at 9 s, before the 10 s warm-up
    const heard = await listen(createClickTrack(120, audioSampleRate, 15), {continuousAnalysis: true, stabilizationTime: 9000});
    const firstReset = heard.findIndex(({event}) => event.type === 'analyzerReset');
    const firstStable = heard.findIndex(({event}) => event.type === 'bpmStable');

    expect(firstReset).to.be.greaterThan(-1);
    expect(firstStable).to.be.greaterThan(-1);
    expect(firstStable).to.be.below(firstReset);
  });
});
