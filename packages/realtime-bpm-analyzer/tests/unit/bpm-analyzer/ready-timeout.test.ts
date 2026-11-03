import {expect} from 'chai';
import {BpmAnalyzer, whenReady} from '../../../src/core/bpm-analyzer';
import {PROTOCOL_VERSION} from '../../../src/contract/types';

/** Enough of an AudioWorkletNode for the analyzer: a port the test plays the processor's side of */
function fakeNode() {
  const posted: unknown[] = [];
  const port = {onmessage: null as ((event: MessageEvent) => void) | null, onmessageerror: null, postMessage: (message: unknown) => posted.push(message)};
  // The test moves the context's clock by hand
  const context = {currentTime: 0};
  // Test double at the boundary: the analyzer only touches the port, onprocessorerror and the context's clock
  const node = {port, onprocessorerror: null, context} as unknown as AudioWorkletNode;
  const send = (data: unknown) => port.onmessage?.(new MessageEvent('message', {data}));
  return {node, posted, send, context};
}

describe('BpmAnalyzer - epoch watchdog', () => {
  const stale = {type: 'step', protocol: PROTOCOL_VERSION, epoch: 0, status: 'listening', progress: 0.1};

  it('drops a backlog of old epochs that lands at once after reset(), however long', () => {
    const {node, send} = fakeNode();
    const analyzer = new BpmAnalyzer(node);
    analyzer.reset();
    for (let i = 0; i < 100; i += 1) {
      send(stale);
    }

    expect(analyzer.state).to.deep.include({status: 'listening', epoch: 1});
  });

  it('fails with a ProtocolError, and stops the processor, when old epochs still come a second after reset()', () => {
    const {node, send, posted, context} = fakeNode();
    const analyzer = new BpmAnalyzer(node);
    analyzer.reset();
    send(stale);
    context.currentTime = 1.5;
    send(stale);

    const {state} = analyzer;
    expect(state.status === 'stopped' && state.error?.name).to.equal('ProtocolError');
    expect(posted.at(-1)).to.deep.equal({type: 'stop', protocol: PROTOCOL_VERSION});
  });

  it('trusts a processor that answered the reset, whatever comes late', () => {
    const {node, send, context} = fakeNode();
    const analyzer = new BpmAnalyzer(node);
    analyzer.reset();
    send({type: 'ready', protocol: PROTOCOL_VERSION, epoch: 1});
    context.currentTime = 5;
    send(stale);

    expect(analyzer.state.status).to.equal('listening');
  });
});

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
