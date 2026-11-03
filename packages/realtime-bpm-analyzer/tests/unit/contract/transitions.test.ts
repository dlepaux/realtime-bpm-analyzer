import {expect} from 'chai';
import {
  MAX_QUEUED_COMMANDS,
  TRANSITIONS,
  createDispatcher,
  isLegal,
  readReading,
  reduce,
  relationTo,
  type ReducerInput,
  type ReducerResult,
} from '../../../src/contract/transitions';
import {
  HYSTERESIS,
  PROTOCOL_VERSION,
  type ActiveStatus,
  type AnalyzerEvent,
  type AnalyzerState,
  type EngineReason,
  type Reading,
  type Status,
} from '../../../src/contract/types';

const protocol = PROTOCOL_VERSION;
const active: ActiveStatus[] = ['listening', 'settling', 'locked'];
const statuses: Status[] = [...active, 'stopped'];
const engineReasons: EngineReason[] = ['first-reading', 'locked', 'unlocked', 'pulse-lost', 'audio-lost', 'tempo-changed'];

const reading = (bpm = 128, to = 10): Reading => ({
  bpm,
  confidence: 0.8,
  candidates: [{bpm, relation: 'top'}, {bpm: bpm / 2, relation: 'half'}],
  audio: {from: Math.max(0, to - 8), to},
  engine: 'tempogram',
});

function stateOf(status: Status, epoch = 0): AnalyzerState {
  switch (status) {
    case 'listening':
      return {status, epoch, progress: 0.5, reason: 'started'};
    case 'settling':
    case 'locked':
      return {status, epoch, reading: reading()};
    case 'stopped':
      return {status, epoch, error: null};
  }
}

const message = (data: unknown): ReducerInput => ({kind: 'message', data});

function step(status: ActiveStatus, reason?: EngineReason, epoch = 0, audioTo = 11): ReducerInput {
  return status === 'listening'
    ? message({type: 'step', protocol, epoch, status, progress: 0.25, reason})
    : message({type: 'step', protocol, epoch, status, reading: reading(128, audioTo), reason});
}

const types = (events: readonly AnalyzerEvent[]) => events.map(event => event.type);

/** A protocol violation is fatal: stopped, reason failed, a ProtocolError kept in the state. */
function expectProtocolError(from: AnalyzerState, result: ReducerResult, label = '') {
  expect(result.state, label).to.deep.equal({status: 'stopped', epoch: from.epoch, error: result.state.status === 'stopped' ? result.state.error : null});
  expect(result.state.status === 'stopped' && result.state.error?.name, label).to.equal('ProtocolError');
  expect(types(result.events), label).to.deep.equal(['statechange']);
  expect(result.events[0].type === 'statechange' && result.events[0].detail.reason, label).to.equal('failed');
}

describe('v6 transition table', () => {
  it('lists exactly the legal transitions of the contract', () => {
    const expected = [
      'listening>settling:first-reading:engine',
      'settling>locked:locked:engine',
      'locked>settling:unlocked:engine',
      ...['pulse-lost', 'audio-lost', 'tempo-changed'].flatMap(reason =>
        [`settling>listening:${reason}:engine`, `locked>listening:${reason}:engine`]),
      'listening>listening:audio-lost:engine',
      ...active.map(from => `${from}>listening:reset:caller`),
      ...active.map(from => `${from}>stopped:stopped:caller`),
      ...active.map(from => `${from}>stopped:failed:fault`),
    ];
    const actual = TRANSITIONS.map(rule => `${rule.from}>${rule.to}:${rule.reason}:${rule.source}`);

    expect(actual).to.have.members(expected);
    expect(actual).to.have.length(expected.length);
  });

  it('never leaves stopped, and the engine moves a status to itself only for a lost input while listening', () => {
    for (const rule of TRANSITIONS) {
      expect(rule.from).to.not.equal('stopped');
      if (rule.source === 'engine' && rule.to === rule.from) {
        expect(`${rule.from}:${rule.reason}`).to.equal('listening:audio-lost');
      }
    }
  });

  it('keeps the unlock band wider than the lock band, whatever phase 3 sets', () => {
    expect(HYSTERESIS.unlockBand).to.be.greaterThan(HYSTERESIS.lockBand);
  });
});

describe('v6 reducer: engine transitions', () => {
  for (const rule of TRANSITIONS.filter(rule => rule.source === 'engine')) {
    it(`moves ${rule.from} to ${rule.to} for ${rule.reason}, then dispatches the measurement`, () => {
      // From pulse-lost, so audio-lost is a change of reason even while listening
      const from: AnalyzerState = rule.from === 'listening'
        ? {status: 'listening', epoch: 0, progress: 0.5, reason: 'pulse-lost'}
        : stateOf(rule.from);
      const result = reduce(from, step(rule.to as ActiveStatus, rule.reason as EngineReason));

      expect(result.state.status).to.equal(rule.to);
      expect(result.state.epoch).to.equal(0);
      expect(types(result.events)).to.deep.equal(['statechange', rule.to === 'listening' ? 'progress' : 'reading']);
      const change = result.events[0];
      expect(change.type === 'statechange' && change.detail).to.deep.include({from, to: result.state, reason: rule.reason});
      expect(change.type === 'statechange' && change.detail.to).to.equal(result.state);
    });
  }

  for (const from of active) {
    for (const to of active) {
      for (const reason of engineReasons) {
        if (isLegal(from, to, reason, 'engine')) {
          continue;
        }

        it(`refuses ${from} to ${to} for ${reason}, fatally`, () => {
          const state = stateOf(from);
          expectProtocolError(state, reduce(state, step(to, reason)));
        });
      }
    }
  }

  it('refuses a change of status without a reason, and a reason only callers or faults give', () => {
    const state = stateOf('settling');
    expectProtocolError(state, reduce(state, step('locked')));
    for (const reason of ['reset', 'stopped', 'failed']) {
      expectProtocolError(state, reduce(state, message({type: 'step', protocol, epoch: 0, status: 'listening', progress: 0, reason})), reason);
    }
  });

  it('reports lost input while listening once, and keeps the reason until the next reading', () => {
    const lost = reduce(stateOf('listening'), step('listening', 'audio-lost'));
    expect(types(lost.events)).to.deep.equal(['statechange', 'progress']);
    expect(lost.state).to.deep.equal({status: 'listening', epoch: 0, progress: 0.25, reason: 'audio-lost'});

    expectProtocolError(lost.state, reduce(lost.state, step('listening', 'audio-lost')));
    expect(reduce(lost.state, step('listening')).state).to.deep.include({reason: 'audio-lost'});
  });

  it('updates the reading or the progress without a statechange when the status holds', () => {
    const listening = reduce(stateOf('listening'), step('listening'));
    expect(types(listening.events)).to.deep.equal(['progress']);
    expect(listening.state).to.deep.equal({status: 'listening', epoch: 0, progress: 0.25, reason: 'started'});

    const settling = stateOf('settling');
    const next = reduce(settling, step('settling', undefined, 0, 12));
    expect(types(next.events)).to.deep.equal(['reading']);
    expect(next.state).to.not.equal(settling);
    expect(next.state.status === 'settling' && next.state.reading.audio.to).to.equal(12);
  });

  it('refuses a reading whose audio goes back in time within the epoch, fatally', () => {
    const state = stateOf('locked');
    expectProtocolError(state, reduce(state, step('locked', undefined, 0, 9)));
  });

  it('runs a whole lock and loss in the documented order', () => {
    const inputs = [step('listening'), step('settling', 'first-reading'), step('locked', 'locked', 0, 12),
      step('settling', 'unlocked', 0, 13), step('listening', 'pulse-lost')];
    let state = stateOf('listening');
    const seen: string[] = [];
    for (const input of inputs) {
      const result = reduce(state, input);
      state = result.state;
      seen.push(...types(result.events));
    }

    expect(seen).to.deep.equal(['progress', 'statechange', 'reading', 'statechange', 'reading',
      'statechange', 'reading', 'statechange', 'progress']);
    expect(state.status).to.equal('listening');
  });
});

describe('v6 reducer: caller commands and faults', () => {
  for (const from of active) {
    it(`reset() from ${from} moves to listening in the next epoch, and tells the processor`, () => {
      const state = stateOf(from, 3);
      const result = reduce(state, {kind: 'reset'});

      expect(result.state).to.deep.equal({status: 'listening', epoch: 4, progress: 0, reason: 'reset'});
      expect(result.events).to.deep.equal([
        {type: 'statechange', detail: {from: state, to: result.state, reason: 'reset'}},
        {type: 'progress', detail: {fraction: 0}},
      ]);
      expect(result.post).to.deep.equal([{type: 'reset', protocol, epoch: 4}]);
    });

    it(`stop() from ${from} is final`, () => {
      const result = reduce(stateOf(from), {kind: 'stop'});

      expect(result.state).to.deep.equal({status: 'stopped', epoch: 0, error: null});
      expect(types(result.events)).to.deep.equal(['statechange']);
      expect(result.post).to.deep.equal([{type: 'stop', protocol}]);
    });

    it(`a fault from ${from} stops with reason failed and keeps the error in the state`, () => {
      const error = {name: 'ProcessorError', message: 'boom'} as const;
      const result = reduce(stateOf(from), {kind: 'fault', error});

      expect(result.state).to.deep.equal({status: 'stopped', epoch: 0, error});
      expect(result.events[0].type === 'statechange' && result.events[0].detail.reason).to.equal('failed');
    });
  }

  it('ignores everything once stopped, and refuses reset()', () => {
    const stopped = stateOf('stopped');
    for (const input of [step('settling', 'first-reading'), {kind: 'stop'}, {kind: 'fault', error: {name: 'ProcessorError', message: 'x'}}] as ReducerInput[]) {
      const result = reduce(stopped, input);
      expect(result.state).to.equal(stopped);
      expect(result.events).to.deep.equal([]);
      expect(result.refused).to.equal(null);
    }

    const reset = reduce(stopped, {kind: 'reset'});
    expect(reset.state).to.equal(stopped);
    expect(reset.refused?.name).to.equal('InvalidStateError');
  });

  it('turns a non-fatal fault into an error event, and a fatal one into failed', () => {
    const error = {name: 'AnalysisError', message: 'step failed'};
    const state = stateOf('locked');

    expect(reduce(state, message({type: 'fault', protocol, epoch: 0, fatal: false, error})).events)
      .to.deep.equal([{type: 'error', detail: error}]);
    expect(reduce(state, message({type: 'fault', protocol, epoch: 0, fatal: true, error})).state)
      .to.deep.equal({status: 'stopped', epoch: 0, error});
  });

  it('passes debug through with its engine, and treats ready as a no-op', () => {
    const state = stateOf('settling');
    expect(reduce(state, message({type: 'debug', protocol, epoch: 0, engine: 'peaks', data: [1]})).events)
      .to.deep.equal([{type: 'debug', detail: {engine: 'peaks', data: [1]}}]);
    expect(reduce(state, message({type: 'ready', protocol, epoch: 0})).state).to.equal(state);
  });
});

describe('v6 reducer: epochs and protocol', () => {
  it('drops a message measured before the last reset(), a non-fatal fault included', () => {
    const afterReset = reduce(stateOf('locked'), {kind: 'reset'}).state;
    const staleFault = message({type: 'fault', protocol, epoch: 0, fatal: false, error: {name: 'AnalysisError', message: 'x'}});
    for (const input of [step('locked'), step('settling', 'unlocked'), message({type: 'nonsense', protocol, epoch: 0}), staleFault]) {
      const result = reduce(afterReset, input);
      expect(result.state).to.equal(afterReset);
      expect(result.events).to.deep.equal([]);
    }
  });

  it('accepts the first message of the new epoch', () => {
    const afterReset = reduce(stateOf('locked'), {kind: 'reset'}).state;
    expect(types(reduce(afterReset, step('listening', undefined, 1)).events)).to.deep.equal(['progress']);
  });

  it('still fails on a fatal fault from any epoch: the processor is gone either way', () => {
    const afterReset = reduce(stateOf('locked'), {kind: 'reset'}).state;
    const error = {name: 'ProcessorError', message: 'x'};
    for (const epoch of [0, 7]) {
      const result = reduce(afterReset, message({type: 'fault', protocol, epoch, fatal: true, error}));
      expect(result.state).to.deep.equal({status: 'stopped', epoch: 1, error});
    }
  });

  it('fails on a message from a future epoch, or with no valid epoch: the processor cannot know one', () => {
    const state = stateOf('settling');
    for (const epoch of [1, -1, 0.5, 'zero', undefined]) {
      expectProtocolError(state, reduce(state, message({type: 'step', protocol, epoch, status: 'settling', reading: reading(128, 11)})), String(epoch));
    }
  });

  it('fails loudly on a processor of another protocol version, a 5.x one included', () => {
    const fiveX = {type: 'bpmStable', data: {bpm: [{tempo: 128, count: 40, confidence: 0.3}], threshold: 0.6}};
    for (const data of [fiveX, {type: 'ready', protocol: protocol + 1, epoch: 0}, 'ready', null]) {
      const result = reduce(stateOf('listening'), message(data));
      expect(result.state.status).to.equal('stopped');
      expect(result.state.status === 'stopped' && result.state.error?.name).to.equal('ProtocolError');
      expect(result.events[0].type === 'statechange' && result.events[0].detail.reason).to.equal('failed');
    }
  });

  it('fails on malformed messages of the right protocol', () => {
    const bad = [
      {type: 'unknown', protocol, epoch: 0},
      {type: 'step', protocol, epoch: 0, status: 'drifting'},
      {type: 'step', protocol, epoch: 0, status: 'listening', progress: 2},
      {type: 'step', protocol, epoch: 0, status: 'listening', progress: 0.1, reason: 'bored'},
      {type: 'step', protocol, epoch: 0, status: 'settling', reading: {...reading(), bpm: 129}},
      {type: 'fault', protocol, epoch: 0, fatal: 'yes', error: {name: 'AnalysisError', message: 'x'}},
      {type: 'fault', protocol, epoch: 0, fatal: false, error: {name: 'IllegalTransition', message: 'x'}},
      {type: 'debug', protocol, epoch: 0, data: 1},
    ];
    const state = stateOf('listening');
    for (const data of bad) {
      expectProtocolError(state, reduce(state, message(data)), JSON.stringify(data));
    }
  });
});

describe('v6 reading validation and relations', () => {
  it('rebuilds a reading from its known fields only, frozen', () => {
    const leaky = {...reading(), threshold: 0.6, candidates: [{bpm: 128, relation: 'top', count: 40}]};
    const read = readReading(leaky);

    expect(read).to.deep.equal({bpm: 128, confidence: 0.8, candidates: [{bpm: 128, relation: 'top'}], audio: {from: 2, to: 10}, engine: 'tempogram'});
    expect(Object.isFrozen(read) && Object.isFrozen(read?.candidates) && Object.isFrozen(read?.candidates[0]) && Object.isFrozen(read?.audio)).to.equal(true);
  });

  it('holds a reading to its documented guarantees', () => {
    expect(readReading(reading())).to.deep.equal(reading());
    const invalid = [
      {...reading(), confidence: 1.2},
      {...reading(), candidates: []},
      {...reading(), candidates: [{bpm: 128, relation: 'half'}]},
      {...reading(), candidates: [{bpm: 128, relation: 'top'}, {bpm: 64, relation: 'top'}]},
      {...reading(), candidates: Array.from({length: 6}, (_, i) => ({bpm: 128, relation: i === 0 ? 'top' : 'other'}))},
      {...reading(), audio: {from: 5, to: 4}},
      {...reading(), engine: 'magic'},
      {...reading(), candidates: [{bpm: 128, relation: 'top'}, {bpm: 90, relation: 'half'}]},
      {...reading(), candidates: [{bpm: 128, relation: 'top'}, {bpm: 64, relation: 'other'}]},
    ];
    for (const value of invalid) {
      expect(readReading(value), JSON.stringify(value)).to.equal(null);
    }
  });

  it('labels half and double within the tolerance, and the rest other', () => {
    expect(relationTo(128, 64)).to.equal('half');
    expect(relationTo(128, 63)).to.equal('half');
    expect(relationTo(128, 256)).to.equal('double');
    expect(relationTo(128, 192)).to.equal('other');
    expect(relationTo(128, 60)).to.equal('other');
  });
});

/** The analyzer as phase 3 will run it, reduced to the dispatcher and a list of listeners. */
function harness() {
  const listeners: ((event: AnalyzerEvent) => void)[] = [];
  const posted: unknown[] = [];
  const dispatcher = createDispatcher(event => listeners.forEach(listener => listener(event)), message => posted.push(message), stateOf('listening'));
  return {...dispatcher, posted, listen: (listener: (event: AnalyzerEvent) => void) => listeners.push(listener)};
}

describe('v6 dispatch: order, late subscribers and re-entrancy', () => {
  it('has state current inside every listener', () => {
    const analyzer = harness();
    const seen: string[] = [];
    analyzer.listen(event => seen.push(`${event.type}@${analyzer.state().status}`));
    analyzer.apply(step('settling', 'first-reading'));

    expect(seen).to.deep.equal(['statechange@settling', 'reading@settling']);
  });

  it('lets a late subscriber read the lock it missed from state', () => {
    const analyzer = harness();
    analyzer.apply(step('settling', 'first-reading'));
    analyzer.apply(step('locked', 'locked', 0, 12));

    const late: AnalyzerEvent[] = [];
    analyzer.listen(event => late.push(event));
    const state = analyzer.state();

    expect(late).to.deep.equal([]);
    expect(state.status).to.equal('locked');
    expect(state.status === 'locked' && state.reading.bpm).to.equal(128);
  });

  it('runs a reset() from a listener after every listener has the whole step', () => {
    const analyzer = harness();
    const first: string[] = [];
    const second: string[] = [];
    analyzer.listen(event => {
      first.push(`${event.type}@${analyzer.state().status}`);
      if (event.type === 'statechange' && event.detail.reason === 'locked') {
        expect(analyzer.apply({kind: 'reset'})).to.equal(null);
      }
    });
    analyzer.listen(event => second.push(`${event.type}@${analyzer.state().status}`));
    analyzer.apply(step('settling', 'first-reading'));
    analyzer.apply(step('locked', 'locked', 0, 12));

    const expected = ['statechange@settling', 'reading@settling', 'statechange@locked', 'reading@locked',
      'statechange@listening', 'progress@listening'];
    expect(first).to.deep.equal(expected);
    expect(second).to.deep.equal(expected);
    expect(analyzer.state()).to.deep.equal({status: 'listening', epoch: 1, progress: 0, reason: 'reset'});
    expect(analyzer.posted).to.deep.equal([{type: 'reset', protocol, epoch: 1}]);
  });

  it('runs a stop() from a listener after the step, and refuses a reset() once stopped', () => {
    const analyzer = harness();
    const seen: string[] = [];
    let refusal: unknown = 'not called';
    analyzer.listen(event => {
      seen.push(event.type);
      if (event.type === 'progress' && event.detail.fraction === 0) {
        analyzer.apply({kind: 'stop'});
      }

      if (event.type === 'statechange' && event.detail.reason === 'stopped') {
        refusal = analyzer.apply({kind: 'reset'});
      }
    });
    analyzer.apply({kind: 'reset'});

    expect(seen).to.deep.equal(['statechange', 'progress', 'statechange']);
    expect(analyzer.state().status).to.equal('stopped');
    expect(refusal).to.deep.include({name: 'InvalidStateError'});
  });

  it('throws instead of looping when a listener resets on every statechange', () => {
    const analyzer = harness();
    analyzer.listen(event => {
      if (event.type === 'statechange') {
        analyzer.apply({kind: 'reset'});
      }
    });

    expect(() => analyzer.apply({kind: 'reset'})).to.throw(RangeError);
    expect(analyzer.state().epoch).to.equal(MAX_QUEUED_COMMANDS + 1);
    // The dispatcher is usable again afterwards
    expect(analyzer.apply(step('listening', undefined, MAX_QUEUED_COMMANDS + 1))).to.equal(null);
    expect(analyzer.state()).to.deep.include({progress: 0.25});
  });
});

describe('v6 status coverage', () => {
  it('has a test state for every status', () => {
    expect(statuses.map(status => stateOf(status).status)).to.deep.equal(statuses);
  });
});
