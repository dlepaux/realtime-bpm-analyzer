import {expect} from 'chai';
import {BpmAnalyzer, whenReady} from '../../../src/core/bpm-analyzer';
import {PROTOCOL_VERSION} from '../../../src/contract/types';

/** Enough of an AudioWorkletNode for the analyzer: a port the test plays the processor's side of */
function fakeNode() {
  const posted: unknown[] = [];
  const port = {onmessage: null as ((event: MessageEvent) => void) | null, onmessageerror: null, postMessage: (message: unknown) => posted.push(message)};
  // Test double at the boundary: the analyzer only touches the port and onprocessorerror
  const node = {port, onprocessorerror: null} as unknown as AudioWorkletNode;
  const send = (data: unknown) => port.onmessage?.(new MessageEvent('message', {data}));
  return {node, posted, send};
}

describe('BpmAnalyzer - startup', () => {
  it('resolves once the processor says ready in epoch 0', async () => {
    const {node, send} = fakeNode();
    const analyzer = new BpmAnalyzer(node);
    const ready = whenReady(analyzer, 1000);
    send({type: 'ready', protocol: PROTOCOL_VERSION, epoch: 0});

    await ready;
    expect(analyzer.state).to.deep.include({status: 'listening', reason: 'started'});
  });

  it('fails with a ProtocolError when no ready comes in time, as a 5.x processor file never sends one', async () => {
    const {node, posted} = fakeNode();
    const analyzer = new BpmAnalyzer(node);
    let caught: unknown;
    try {
      await whenReady(analyzer, 20);
    } catch (error) {
      caught = error;
    }

    expect(caught).to.be.instanceOf(Error).with.property('name', 'ProtocolError');
    expect(analyzer.state.status).to.equal('stopped');
    expect(posted).to.deep.include({type: 'stop', protocol: PROTOCOL_VERSION});
  });

  it('fails at once on a fatal fault before ready, with the error of the processor', async () => {
    const {node, send} = fakeNode();
    const analyzer = new BpmAnalyzer(node);
    const ready = whenReady(analyzer, 1000);
    send({type: 'fault', protocol: PROTOCOL_VERSION, epoch: 0, fatal: true, error: {name: 'ProtocolError', message: 'stale'}});

    let caught: unknown;
    try {
      await ready;
    } catch (error) {
      caught = error;
    }

    expect(caught).to.be.instanceOf(Error).with.property('name', 'ProtocolError');
    expect((caught as Error).message).to.contain('stale');
  });
});
