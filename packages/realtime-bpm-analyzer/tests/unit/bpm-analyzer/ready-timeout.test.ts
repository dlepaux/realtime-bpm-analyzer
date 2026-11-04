import {expect} from 'chai';
import {BpmAnalyzer, processorProtocol, whenReady} from '../../../src/core/bpm-analyzer';
import {PROTOCOL} from '../../../src/contract/types';

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
  /** An epoch-0 step, stamped with the worklet time it was sent at */
  const stale = (at: number) => ({type: 'step', protocol: PROTOCOL, epoch: 0, status: 'listening', progress: 0.1, at});

  it('drops a backlog of old epochs that lands at once after reset(), however long', () => {
    const {node, send} = fakeNode();
    const analyzer = new BpmAnalyzer(node);
    analyzer.reset();
    for (let i = 0; i < 100; i += 1) {
      send(stale(0));
    }

    expect(analyzer.state).to.deep.include({status: 'listening', epoch: 1});
  });

  it('survives a main thread blocked past the window, with an old step queued before the worklet adopted the reset', () => {
    const {node, send, context} = fakeNode();
    context.currentTime = 10;
    const analyzer = new BpmAnalyzer(node);
    analyzer.reset();
    // A click handler runs on for 1.2 s after reset(): the audio clock moves, the port holds what came meanwhile
    context.currentTime = 11.2;
    send(stale(10.003));
    send({type: 'ready', protocol: PROTOCOL, epoch: 1, at: 10.004});

    expect(analyzer.state).to.deep.include({status: 'listening', epoch: 1});
    expect(() => analyzer.reset()).to.not.throw();
  });

  it('fails with a ProtocolError, and stops the processor, when the processor still sends old epochs a second after reset()', () => {
    const {node, send, posted, context} = fakeNode();
    const analyzer = new BpmAnalyzer(node);
    analyzer.reset();
    send(stale(0.5));
    context.currentTime = 1.5;
    send(stale(1.5));

    const {state} = analyzer;
    expect(state.status === 'stopped' && state.error?.name).to.equal('ProtocolError');
    expect(posted.at(-1)).to.deep.equal({type: 'stop', protocol: PROTOCOL});
  });

  it('fails with a ProtocolError on an old epoch without its send time, as no v6 processor sends one', () => {
    const {node, send} = fakeNode();
    const analyzer = new BpmAnalyzer(node);
    analyzer.reset();
    send({type: 'step', protocol: PROTOCOL, epoch: 0, status: 'listening', progress: 0.1});

    const {state} = analyzer;
    expect(state.status === 'stopped' && state.error?.name).to.equal('ProtocolError');
  });

  it('trusts a processor that answered the reset, whatever comes late', () => {
    const {node, send, context} = fakeNode();
    const analyzer = new BpmAnalyzer(node);
    analyzer.reset();
    send({type: 'ready', protocol: PROTOCOL, epoch: 1, at: 0});
    context.currentTime = 5;
    send(stale(5));

    expect(analyzer.state.status).to.equal('listening');
  });
});

describe('BpmAnalyzer - startup', () => {
  it('resolves once the processor says ready in epoch 0', async () => {
    const {node, send} = fakeNode();
    const analyzer = new BpmAnalyzer(node);
    const ready = whenReady(analyzer, 1000);
    send({type: 'ready', protocol: PROTOCOL, epoch: 0});

    await ready;
    expect(analyzer.state).to.deep.include({status: 'listening', reason: 'started'});
  });

  it('resolves on a ready from a later minor, and keeps that minor for features that need it', async () => {
    const {node, send} = fakeNode();
    const analyzer = new BpmAnalyzer(node);
    const ready = whenReady(analyzer, 1000);
    const newer = {major: PROTOCOL.major, minor: PROTOCOL.minor + 1};
    send({type: 'ready', protocol: newer, epoch: 0, at: 0});

    await ready;
    expect(analyzer.state.status).to.equal('listening');
    expect(processorProtocol(analyzer)).to.deep.equal(newer);
  });

  it('knows no processor protocol before ready, and refuses a ready of another major', () => {
    const {node, send} = fakeNode();
    const analyzer = new BpmAnalyzer(node);
    expect(processorProtocol(analyzer)).to.equal(null);

    send({type: 'ready', protocol: {major: PROTOCOL.major + 1, minor: 0}, epoch: 0, at: 0});
    const {state} = analyzer;
    expect(state.status === 'stopped' && state.error?.name).to.equal('ProtocolError');
    expect(processorProtocol(analyzer)).to.equal(null);
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
    expect(posted).to.deep.include({type: 'stop', protocol: PROTOCOL});
  });

  it('fails at once on a fatal fault before ready, with the error of the processor', async () => {
    const {node, send} = fakeNode();
    const analyzer = new BpmAnalyzer(node);
    const ready = whenReady(analyzer, 1000);
    send({type: 'fault', protocol: PROTOCOL, epoch: 0, fatal: true, error: {name: 'ProtocolError', message: 'stale'}});

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
