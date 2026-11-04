import {expect} from 'chai';
import {contextNow} from '../../../src/core/context-now';

/** Only the clock fields contextNow reads */
const context = (fields: Record<string, unknown>) => ({currentTime: 4, state: 'running', ...fields}) as unknown as BaseAudioContext;

describe('contextNow', () => {
  it('extrapolates the output timestamp to now, plus the output latency, when currentTime is stale', () => {
    const performanceTime = performance.now() - 500;
    const now = contextNow(context({outputLatency: 0.02, getOutputTimestamp: () => ({contextTime: 4, performanceTime})}));

    expect(now).to.be.closeTo(4.52, 0.05);
  });

  it('never reads earlier than currentTime', () => {
    const now = contextNow(context({currentTime: 9, getOutputTimestamp: () => ({contextTime: 4, performanceTime: performance.now()})}));

    expect(now).to.equal(9);
  });

  it('reads currentTime when the context does not run, or has no output timestamp', () => {
    const timestamp = () => ({contextTime: 1, performanceTime: performance.now() - 60_000});
    expect(contextNow(context({state: 'suspended', getOutputTimestamp: timestamp}))).to.equal(4);
    expect(contextNow(context({}))).to.equal(4);
    expect(contextNow(context({getOutputTimestamp: () => ({})}))).to.equal(4);
  });
});
