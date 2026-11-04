import {expect} from 'chai';
import {createRealtimeBpmAnalyzer} from '../../src/index';
import type {AnalyzerEventMap, BpmAnalyzer, StateChange} from '../../src/index';
import {PROTOCOL} from '../../src/contract/types';
import {createClickTrack} from '../fixtures/click-track';
import {createTestAudioContext, closeAudioContext, waitForEvent} from '../setup';

/**
 * The event contract on a real analyzer: messages are fed to its port as the processor would send them, so what
 * is tested is the wiring from the port through the reducer to `on()` listeners and `state`.
 */
describe('BpmAnalyzer - events and commands', function () {
  this.timeout(5000);

  let audioContext: AudioContext;

  beforeEach(() => {
    audioContext = createTestAudioContext();
  });

  afterEach(async () => {
    await closeAudioContext(audioContext);
  });

  const reading = (bpm: number, to: number) => ({
    bpm,
    bpmExact: bpm,
    confidence: 0.5,
    candidates: [{bpm, relation: 'top'}, {bpm: bpm / 2, relation: 'half'}],
    audio: {from: 0, to, contextTime: to},
    engine: 'peaks',
  });

  /** What the processor would post, delivered the way its port delivers it */
  function send(analyzer: BpmAnalyzer, data: Record<string, unknown>): void {
    analyzer.node.port.onmessage?.(new MessageEvent('message', {data: {protocol: PROTOCOL, at: analyzer.context.currentTime, ...data}}));
  }

  function record<T extends keyof AnalyzerEventMap>(analyzer: BpmAnalyzer, type: T): Array<AnalyzerEventMap[T]> {
    const received: Array<AnalyzerEventMap[T]> = [];
    analyzer.on(type, detail => received.push(detail));
    return received;
  }

  describe('on() and off()', () => {
    it('calls every listener with the typed payload, in registration order', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);
      const order: string[] = [];
      analyzer.on('progress', ({fraction}) => order.push(`first ${fraction}`));
      analyzer.on('progress', ({fraction}) => order.push(`second ${fraction}`));

      send(analyzer, {type: 'step', epoch: 0, status: 'listening', progress: 0.25});

      expect(order).to.deep.equal(['first 0.25', 'second 0.25']);
      expect(analyzer.state).to.deep.include({status: 'listening', progress: 0.25});
    });

    it('returns an unsubscribe function, and off() removes the same listener', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);
      const viaReturn: number[] = [];
      const viaOff: number[] = [];
      const listener = ({fraction}: {fraction: number}) => viaOff.push(fraction);
      const unsubscribe = analyzer.on('progress', ({fraction}) => viaReturn.push(fraction));
      analyzer.on('progress', listener);

      send(analyzer, {type: 'step', epoch: 0, status: 'listening', progress: 0.1});
      unsubscribe();
      analyzer.off('progress', listener);
      send(analyzer, {type: 'step', epoch: 0, status: 'listening', progress: 0.2});

      expect(viaReturn).to.deep.equal([0.1]);
      expect(viaOff).to.deep.equal([0.1]);
    });

    it('calls a listener added twice once, and ignores off() of one never added', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);
      const calls: number[] = [];
      const listener = ({fraction}: {fraction: number}) => calls.push(fraction);
      analyzer.on('progress', listener);
      analyzer.on('progress', listener);

      expect(() => analyzer.off('reading', () => undefined)).to.not.throw();
      send(analyzer, {type: 'step', epoch: 0, status: 'listening', progress: 0.3});

      expect(calls).to.deep.equal([0.3]);
    });

    it('honours once and an aborted signal', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);
      const once: number[] = [];
      const signalled: number[] = [];
      const controller = new AbortController();
      analyzer.on('progress', ({fraction}) => once.push(fraction), {once: true});
      analyzer.on('progress', ({fraction}) => signalled.push(fraction), {signal: controller.signal});

      send(analyzer, {type: 'step', epoch: 0, status: 'listening', progress: 0.1});
      controller.abort();
      send(analyzer, {type: 'step', epoch: 0, status: 'listening', progress: 0.2});

      expect(once).to.deep.equal([0.1]);
      expect(signalled).to.deep.equal([0.1]);
    });

    it('drops its abort listener from the signal when unsubscribed or removed with off()', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);
      const controller = new AbortController();
      const {signal} = controller;
      const added: unknown[] = [];
      const removed: unknown[] = [];
      const add = signal.addEventListener.bind(signal);
      const remove = signal.removeEventListener.bind(signal);
      signal.addEventListener = (type: string, callback: any, options?: any) => {
        added.push(callback);
        add(type, callback, options);
      };

      signal.removeEventListener = (type: string, callback: any, options?: any) => {
        removed.push(callback);
        remove(type, callback, options);
      };

      const listener = () => undefined;
      const unsubscribe = analyzer.on('progress', () => undefined, {signal});
      analyzer.on('reading', listener, {signal});
      unsubscribe();
      analyzer.off('reading', listener);

      expect(added).to.have.length(2);
      expect(removed).to.deep.equal(added);
    });
  });

  describe('state and transitions', () => {
    it('settles on the first reading and locks, with statechange before reading and state already moved', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);
      const order: string[] = [];
      analyzer.on('statechange', ({to, reason}) => {
        expect(analyzer.state).to.equal(to);
        order.push(`statechange ${to.status} ${reason}`);
      });
      analyzer.on('reading', ({bpm}) => order.push(`reading ${bpm}`));

      send(analyzer, {type: 'step', epoch: 0, status: 'settling', reason: 'first-reading', reading: reading(128, 2)});
      send(analyzer, {type: 'step', epoch: 0, status: 'settling', reading: reading(128, 3)});
      send(analyzer, {type: 'step', epoch: 0, status: 'locked', reason: 'locked', reading: reading(128, 4)});

      expect(order).to.deep.equal([
        'statechange settling first-reading', 'reading 128', 'reading 128', 'statechange locked locked', 'reading 128',
      ]);
      expect(analyzer.state.status).to.equal('locked');
    });

    it('reports a reading as frozen data carrying the half and double relation', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);
      const readings = record(analyzer, 'reading');

      send(analyzer, {type: 'step', epoch: 0, status: 'settling', reason: 'first-reading', reading: reading(128, 2)});

      expect(readings).to.have.length(1);
      expect(readings[0].candidates).to.deep.equal([{bpm: 128, relation: 'top'}, {bpm: 64, relation: 'half'}]);
      expect(Object.isFrozen(readings[0])).to.equal(true);
    });

    it('goes back to listening on pulse-lost, then settles again', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);
      const changes = record(analyzer, 'statechange');

      send(analyzer, {type: 'step', epoch: 0, status: 'settling', reason: 'first-reading', reading: reading(128, 2)});
      send(analyzer, {type: 'step', epoch: 0, status: 'listening', reason: 'pulse-lost', progress: 0});
      send(analyzer, {type: 'step', epoch: 0, status: 'settling', reason: 'first-reading', reading: reading(120, 6)});

      expect(changes.map(({from, to, reason}) => `${from.status}>${to.status} ${reason}`)).to.deep.equal([
        'listening>settling first-reading', 'settling>listening pulse-lost', 'listening>settling first-reading',
      ]);
    });

    it('fails with a ProtocolError on a move the table forbids, and stops', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);
      const errors = record(analyzer, 'error');
      const changes = record(analyzer, 'statechange');

      send(analyzer, {type: 'step', epoch: 0, status: 'locked', reason: 'locked', reading: reading(128, 2)});

      // Fatal faults live in the state, not in error events, which are for non-fatal ones
      const {state} = analyzer;
      expect(state.status === 'stopped' && state.error?.name).to.equal('ProtocolError');
      expect(changes.map(({reason}) => reason)).to.deep.equal(['failed']);
      expect(errors).to.deep.equal([]);
    });

    it('fails on a message from another protocol, as a stale processor file would send', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);
      analyzer.node.port.onmessage?.(new MessageEvent('message', {data: {message: 'BPM', data: {bpm: []}}}));

      expect(analyzer.state.status).to.equal('stopped');
      expect(analyzer.state.status === 'stopped' && analyzer.state.error?.name).to.equal('ProtocolError');
    });

    it('forwards a non-fatal fault as an error event and keeps listening', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);
      const errors = record(analyzer, 'error');

      send(analyzer, {type: 'fault', epoch: 0, fatal: false, error: {name: 'AnalysisError', message: 'one buffer failed'}});

      expect(errors).to.deep.equal([{name: 'AnalysisError', message: 'one buffer failed'}]);
      expect(analyzer.state.status).to.equal('listening');
    });

    it('forwards debug only as debug events', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext, {debug: true});
      const debug = record(analyzer, 'debug');

      send(analyzer, {type: 'debug', epoch: 0, engine: 'peaks', data: {threshold: 0.5}});

      expect(debug).to.deep.equal([{engine: 'peaks', data: {threshold: 0.5}}]);
    });
  });

  describe('reset()', () => {
    it('moves to listening with reason reset in a new epoch, before it returns', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);
      const changes = record(analyzer, 'statechange');
      const progress = record(analyzer, 'progress');
      send(analyzer, {type: 'step', epoch: 0, status: 'settling', reason: 'first-reading', reading: reading(128, 2)});

      analyzer.reset();

      expect(analyzer.state).to.deep.equal({status: 'listening', epoch: 1, progress: 0, reason: 'reset'});
      const last: StateChange | undefined = changes.at(-1);
      expect(last?.reason).to.equal('reset');
      expect(last?.from.status).to.equal('settling');
      expect(progress.at(-1)).to.deep.equal({fraction: 0});
    });

    it('drops what the processor measured before the reset', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);
      analyzer.reset();
      const readings = record(analyzer, 'reading');

      send(analyzer, {type: 'step', epoch: 0, status: 'settling', reason: 'first-reading', reading: reading(128, 2)});

      expect(readings).to.deep.equal([]);
      expect(analyzer.state).to.deep.include({status: 'listening', epoch: 1});
    });

    it('lets a listener reset from inside a statechange, after the current dispatch', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);
      const seen: string[] = [];
      analyzer.on('statechange', ({to, reason}) => {
        seen.push(`${to.status} ${reason}`);
        if (to.status === 'settling') {
          analyzer.reset();
        }
      });
      analyzer.on('reading', ({bpm}) => seen.push(`reading ${bpm}`));

      send(analyzer, {type: 'step', epoch: 0, status: 'settling', reason: 'first-reading', reading: reading(128, 2)});

      expect(seen).to.deep.equal(['settling first-reading', 'reading 128', 'listening reset']);
      expect(analyzer.state).to.deep.include({status: 'listening', epoch: 1});
    });
  });

  describe('stop()', () => {
    it('moves to stopped once, ignores later messages, and refuses reset()', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);
      const changes = record(analyzer, 'statechange');

      analyzer.stop();
      analyzer.stop();
      send(analyzer, {type: 'step', epoch: 0, status: 'settling', reason: 'first-reading', reading: reading(128, 2)});

      expect(changes.map(({to, reason}) => `${to.status} ${reason}`)).to.deep.equal(['stopped stopped']);
      expect(analyzer.state).to.deep.equal({status: 'stopped', epoch: 0, error: null});
      expect(() => analyzer.reset()).to.throw(DOMException).with.property('name', 'InvalidStateError');
    });
  });

  describe('with audio', () => {
    it('survives a main thread blocked past the watchdog window right after reset(), with old steps queued', async function () {
      this.timeout(15_000);
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);
      const pcm = createClickTrack(128, audioContext.sampleRate, 8);
      const buffer = audioContext.createBuffer(1, pcm.length, audioContext.sampleRate);
      buffer.copyToChannel(pcm, 0);
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(analyzer.input);

      const firstStep = waitForEvent(analyzer, 'progress', 5000);
      source.start();
      await firstStep;

      // Steps keep coming while the main thread is busy: they queue in epoch 0. Then a click handler resets and
      // runs on past the window. The audio clock moves all along, so only the send time tells them apart.
      const busy = (ms: number) => {
        const until = performance.now() + ms;
        while (performance.now() < until) {
          // Blocking on purpose: this is the blocked main thread under test
        }
      };

      busy(300);
      const resetAt = audioContext.currentTime;
      analyzer.reset();
      busy(1200);
      // What the watchdog compared before messages carried their send time: past the window, so this run is the case
      const blockedFor = audioContext.currentTime - resetAt;
      await waitForEvent(analyzer, 'progress', 5000);
      source.stop();

      expect(blockedFor).to.be.greaterThan(1);
      expect(analyzer.state).to.deep.include({status: 'listening', epoch: 1});
      analyzer.stop();
    });

    it('reports listening progress from the real processor', async function () {
      this.timeout(10_000);
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);
      const pcm = createClickTrack(128, audioContext.sampleRate, 3);
      const buffer = audioContext.createBuffer(1, pcm.length, audioContext.sampleRate);
      buffer.copyToChannel(pcm, 0);
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(analyzer.input);

      const progress = waitForEvent(analyzer, 'progress', 5000);
      source.start();
      const {fraction} = await progress;
      source.stop();
      analyzer.stop();

      expect(fraction).to.be.within(0, 1);
    });
  });
});
