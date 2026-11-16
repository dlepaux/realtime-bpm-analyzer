import {expect} from 'chai';
import {createSession} from '../../../src/core/session';
import type {ResolvedEngine} from '../../../src/core/engine';
import {minValidThreshold, stableWarmUpSeconds} from '../../../src/core/consts';
import {createClickTrack} from '../../fixtures/click-track';
import {feedSession} from '../../setup';
import type {TimedMessage} from '../../setup';

const bufferSize = 4096;
const audioSampleRate = 44_100;

/** The peaks engine's debug detail: the rung its candidates came from, and the floor */
type PeaksDebug = {threshold: number; floor: number};

async function listen(samples: Float32Array, engine: ResolvedEngine = {name: 'peaks'}): Promise<TimedMessage[]> {
  const session = createSession({engine, tempoRange: {min: 90, max: 180}, debug: true});
  return feedSession(session, samples, audioSampleRate, bufferSize);
}

const locks = (heard: readonly TimedMessage[]) => heard.filter(({message}) => message.type === 'step' && message.status === 'locked' && message.reason === 'locked');

/** Each step's rung, from the debug message sent right before it */
function rungs(heard: readonly TimedMessage[]): Array<{at: number; debug: PeaksDebug}> {
  return heard.flatMap(({message, heard: at}) => (message.type === 'debug' ? [{at, debug: message.data as PeaksDebug}] : []));
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

describe('peaks engine - the lock waits for the warm-up (RBA-107)', () => {
  it('reads above the lowest threshold well before the warm-up, yet does not lock until it', async () => {
    const heard = await listen(createClickTrack(120, audioSampleRate, 15));
    const firstReading = heard.find(({message}) => message.type === 'step' && message.status === 'settling');
    const firstHighRung = rungs(heard).find(({debug}) => debug.threshold > minValidThreshold);
    const locked = locks(heard);

    expect(firstReading, 'a reading before the warm-up').to.not.equal(undefined);
    expect(firstHighRung!.at).to.be.below(stableWarmUpSeconds);
    expect(locked).to.have.length(1);
    expect(locked[0].heard).to.be.at.least(stableWarmUpSeconds);
  });

  it('locks on a reading held since early on as soon as the warm-up ends, even on the top threshold', async () => {
    // Clicks loud enough to fill the top threshold first: no higher one is left to fill after the warm-up
    const loud = createClickTrack(120, audioSampleRate, 15).map(sample => sample * 1.2);
    const heard = await listen(loud);
    const [lock] = locks(heard);
    const rungAtLock = rungs(heard).filter(({at}) => at === lock.heard).at(-1);

    expect(locks(heard)).to.have.length(1);
    expect(rungAtLock?.debug.threshold).to.equal(0.9);
    expect(lock.heard).to.be.below(stableWarmUpSeconds + (bufferSize / audioSampleRate));
    expect(lock.message.type === 'step' && lock.message.status === 'locked' && lock.message.reading.bpm).to.equal(120);
  });

  it('re-anchors on each higher threshold that fills after the lock, without leaving it', async () => {
    const heard = await listen(swellingClicks(30));
    const lockAt = locks(heard)[0].heard;
    const floors = rungs(heard).filter(({at}) => at >= lockAt).map(({debug}) => debug.floor);
    const left = heard.filter(({message, heard: at}) => at > lockAt && message.type === 'step' && message.status !== 'locked');

    expect(locks(heard)).to.have.length(1);
    expect(new Set(floors).size).to.be.greaterThan(1);
    for (let i = 1; i < floors.length; i++) {
      expect(floors[i]).to.be.at.least(floors[i - 1]);
    }

    expect(left).to.deep.equal([]);
  });

  it('with restartAfterSeconds, waits only as long as the restart period, so the lock comes before the restart', async () => {
    // The first reading comes at about 7.5 s, and the restart at 9 s, before the 10 s warm-up
    const heard = await listen(createClickTrack(120, audioSampleRate, 15), {name: 'peaks', restartAfterSeconds: 9});
    const firstRestart = heard.findIndex(({message}) => message.type === 'step' && message.reason === 'tempo-changed');
    const firstLock = heard.indexOf(locks(heard)[0]);

    expect(firstRestart).to.be.greaterThan(-1);
    expect(firstLock).to.be.greaterThan(-1);
    expect(firstLock).to.be.below(firstRestart);
  });
});
