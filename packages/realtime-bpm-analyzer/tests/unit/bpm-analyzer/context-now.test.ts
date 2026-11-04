import {expect} from 'chai';
import {contextNow} from '../../../src/core/context-now';

/** Only the clock fields contextNow reads */
const context = (fields: Record<string, unknown>) => ({currentTime: 4, state: 'running', ...fields}) as unknown as BaseAudioContext;

describe('contextNow', () => {
  it('extrapolates the output timestamp to now, plus the output latency, when currentTime is stale', () => {
    const now = contextNow(context({outputLatency: 0.02, getOutputTimestamp: () => ({contextTime: 4, performanceTime: 1000})}), 1500);

    expect(now).to.be.closeTo(4.52, 1e-9);
  });

  it('never reads earlier than currentTime', () => {
    const now = contextNow(context({currentTime: 9, getOutputTimestamp: () => ({contextTime: 4, performanceTime: 1000})}), 1000);

    expect(now).to.equal(9);
  });

  it('reads currentTime when the context does not run, or has no output timestamp', () => {
    const timestamp = () => ({contextTime: 1, performanceTime: 1000});
    expect(contextNow(context({state: 'suspended', getOutputTimestamp: timestamp}), 61_000)).to.equal(4);
    expect(contextNow(context({}))).to.equal(4);
    expect(contextNow(context({getOutputTimestamp: () => ({})}))).to.equal(4);
  });

  it('reads currentTime before the output has rendered, when the timestamp is still zero', () => {
    // Extrapolating from performanceTime 0 would put the clock at performance.now(), thousands of seconds ahead
    expect(contextNow(context({getOutputTimestamp: () => ({contextTime: 0, performanceTime: 0})}), 90_000)).to.equal(4);
  });
});
