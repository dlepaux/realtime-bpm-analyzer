import {expect} from 'chai';
import {createSession} from '../../../src/core/session';
import type {LockClock} from '../../../src/core/session';
import {PROTOCOL_VERSION} from '../../../src/contract/types';
import {reduce, initialState} from '../../../src/contract/transitions';
import type {AnalyzerState} from '../../../src/contract/types';
import {createClickTrack} from '../../fixtures/click-track';
import {feedSession, stepsOf} from '../../setup';

const sampleRate = 44_100;
const range = {min: 90, max: 180};

/** Runs messages through the main thread's reducer, failing on any refusal */
function reduceAll(messages: ReadonlyArray<{message: unknown}>, state: AnalyzerState = initialState()): AnalyzerState {
  return messages.reduce((current, {message}) => {
    const next = reduce(current, {kind: 'message', data: message}).state;
    expect(next.status, JSON.stringify(message)).to.not.equal('stopped');
    return next;
  }, state);
}

describe('session - what the worklet sends', () => {
  for (const name of ['peaks', 'tempogram'] as const) {
    it(`sends only what the main thread accepts, for ${name}, and ends locked on clicks`, async function () {
      this.timeout(20_000);
      const session = createSession({engine: {name}, tempoRange: range, debug: true});
      const messages = await feedSession(session, createClickTrack(128, sampleRate, 20), sampleRate);
      const state = reduceAll(messages);

      expect(messages.every(({message}) => message.protocol === PROTOCOL_VERSION && message.epoch === 0)).to.equal(true);
      expect(state.status).to.equal('locked');
      expect(state.status === 'locked' && Math.round(state.reading.bpm)).to.equal(128);
      expect(state.status === 'locked' && state.reading.engine).to.equal(name);
    });
  }

  it('gives readings whose audio span grows within the epoch, and candidates their relation', async () => {
    const session = createSession({engine: {name: 'peaks'}, tempoRange: range, debug: false});
    const readings = stepsOf(await feedSession(session, createClickTrack(120, sampleRate, 15), sampleRate))
      .flatMap(step => (step.status === 'listening' ? [] : [step.reading]));

    expect(readings.length).to.be.greaterThan(0);
    for (let i = 1; i < readings.length; i++) {
      expect(readings[i].audio.to).to.be.greaterThan(readings[i - 1].audio.to);
    }

    for (const reading of readings) {
      expect(reading.audio.from).to.be.at.least(0).and.at.most(reading.audio.to);
      expect(reading.candidates[0]).to.deep.equal({bpm: reading.bpm, relation: 'top'});
      expect(reading.confidence).to.be.within(0, 1);
      expect(reading.candidates.slice(1).every(({relation}) => relation !== 'top')).to.equal(true);
    }
  });

  it('adopts a reset epoch with a ready, starts the engine over, and drops what was measured before it', async () => {
    const session = createSession({engine: {name: 'peaks'}, tempoRange: range, debug: false});
    const pcm = createClickTrack(120, sampleRate, 10);
    await feedSession(session, pcm, sampleRate);

    // A reset that lands while a buffer is being analysed
    const inFlight = session.analyze(pcm.subarray(0, 4096), 4096, sampleRate);
    expect(session.adopt(1)).to.deep.equal([{type: 'ready', protocol: PROTOCOL_VERSION, epoch: 1}]);
    expect(await inFlight).to.deep.equal([]);
    expect(session.epoch()).to.equal(1);

    const after = await feedSession(session, pcm.subarray(0, 4096 * 3), sampleRate);
    expect(after.every(({message}) => message.epoch === 1)).to.equal(true);
    expect(stepsOf(after).every(step => step.status === 'listening' && step.progress < 1)).to.equal(true);
  });

  it('sends nothing for a restart while listening, and the move to listening otherwise', async () => {
    const session = createSession({engine: {name: 'peaks'}, tempoRange: range, debug: false});

    expect(session.restartForLostAudio()).to.deep.equal([]);
    await feedSession(session, createClickTrack(120, sampleRate, 10), sampleRate);
    expect(session.restartForLostAudio()).to.deep.equal([{type: 'step', protocol: PROTOCOL_VERSION, epoch: 0, status: 'listening', progress: 0, reason: 'audio-lost'}]);
  });

  it('reads on while the live input clock is losing, and withholds the lock, which arms its start-over', async () => {
    let losing = false;
    let offered = 0;
    const clock: LockClock = {
      offerLock: () => {
        offered += 1;
        return !losing;
      },
      forget: () => undefined,
    };
    const session = createSession({engine: {name: 'peaks'}, tempoRange: range, debug: false}, () => clock);
    const pcm = createClickTrack(120, sampleRate, 30);
    const firstHalf = await feedSession(session, pcm.subarray(0, sampleRate * 9), sampleRate);
    losing = true;
    const lost = await feedSession(session, pcm.subarray(sampleRate * 9, sampleRate * 15), sampleRate);

    expect(stepsOf(firstHalf).some(step => step.status === 'settling')).to.equal(true);
    // The warm-up ended during the loss: the engine offered a lock, the clock refused it, and readings went on
    expect(offered).to.be.greaterThan(0);
    expect(stepsOf(lost).every(step => step.status === 'settling' && step.reason === undefined)).to.equal(true);
    reduceAll([...firstHalf, ...lost]);
  });

  it('relocks peaks after a lost pulse, on the rung it locked on before', async () => {
    const session = createSession({engine: {name: 'peaks'}, tempoRange: range, debug: false});
    const clicks = createClickTrack(120, sampleRate, 14);
    const pcm = new Float32Array(clicks.length * 2 + sampleRate * 4);
    pcm.set(clicks, 0);
    pcm.set(clicks, clicks.length + sampleRate * 4);
    const moves = stepsOf(await feedSession(session, pcm, sampleRate)).flatMap(step => (step.reason ? [step.reason] : []));

    expect(moves).to.include('pulse-lost');
    expect(moves.slice(moves.indexOf('pulse-lost'))).to.include('locked');
  });
});
