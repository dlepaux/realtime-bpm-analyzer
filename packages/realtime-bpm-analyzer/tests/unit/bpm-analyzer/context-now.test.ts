import {expect} from 'chai';
import {contextNow} from '../../../src/core/context-now';

/** Only the clock fields contextNow reads */
const context = (fields: Record<string, unknown>) => ({currentTime: 4, state: 'running', ...fields}) as unknown as BaseAudioContext;

describe('contextNow', () => {
  it('extrapolates the output timestamp to now, plus the output latency, when currentTime is stale', () => {
    const now = contextNow(context({outputLatency: 0.02, getOutputTimestamp: () => ({contextTime: 4, performanceTime: 1000})}), null, 1500);

    expect(now).to.be.closeTo(4.52, 1e-9);
  });

  it('never reads earlier than currentTime', () => {
    const now = contextNow(context({currentTime: 9, getOutputTimestamp: () => ({contextTime: 4, performanceTime: 1000})}), null, 1000);

    expect(now).to.equal(9);
  });

  it('reads currentTime when the context does not run, or has no output timestamp', () => {
    const timestamp = () => ({contextTime: 1, performanceTime: 1000});
    expect(contextNow(context({state: 'suspended', getOutputTimestamp: timestamp}), null, 61_000)).to.equal(4);
    expect(contextNow(context({}))).to.equal(4);
    expect(contextNow(context({getOutputTimestamp: () => ({})}))).to.equal(4);
  });

  it('reads currentTime before the output has rendered, when the timestamp is still zero', () => {
    // Extrapolating from performanceTime 0 would put the clock at performance.now(), thousands of seconds ahead
    expect(contextNow(context({getOutputTimestamp: () => ({contextTime: 0, performanceTime: 0})}), null, 90_000)).to.equal(4);
  });

  it('extrapolates the last message heard from the processor when currentTime and the output timestamp both stand still', () => {
    // Firefox in CI: currentTime froze through a 1.2 s block, and the output timestamp gave nothing to extrapolate
    const now = contextNow(context({getOutputTimestamp: () => ({contextTime: 0, performanceTime: 0})}), {at: 4.1, wall: 1000}, 2200);

    expect(now).to.be.closeTo(5.3, 1e-9);
  });

  it('takes the later of the output timestamp and the message heard, as each only ever reads early', () => {
    const output = {getOutputTimestamp: () => ({contextTime: 5, performanceTime: 1000})};
    expect(contextNow(context(output), {at: 4.5, wall: 1000}, 1000)).to.equal(5);
    expect(contextNow(context(output), {at: 5.5, wall: 1000}, 1000)).to.equal(5.5);
  });

  it('reads currentTime, not the message heard, while the context does not run', () => {
    // A suspended clock stands still while performance.now() runs on
    expect(contextNow(context({state: 'suspended'}), {at: 4, wall: 1000}, 61_000)).to.equal(4);
  });
});
