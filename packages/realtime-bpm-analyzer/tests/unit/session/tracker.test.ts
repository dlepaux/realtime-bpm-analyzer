import {expect} from 'chai';
import {createTracker} from '../../../src/core/tracker';
import type {TrackerInput} from '../../../src/core/tracker';
import {HYSTERESIS} from '../../../src/contract/types';

const hysteresis = HYSTERESIS;

/** One step, heard at `now`, with a pulse and a reading at `bpm` unless told otherwise */
function input(now: number, bpm: number | null, more: Partial<TrackerInput> = {}): TrackerInput {
  return {now, bpm, pulse: bpm !== null, lockOffered: false, audioLost: false, acceptLock: () => true, ...more};
}

/** A tracker taken to locked at 120, at 1 s */
function lockedTracker() {
  const tracker = createTracker(hysteresis);
  tracker.step(input(0.5, 120));
  expect(tracker.step(input(1, 120, {lockOffered: true}))).to.deep.equal({status: 'locked', reason: 'locked'});
  return tracker;
}

describe('tracker - engine-neutral states', () => {
  it('starts listening, and settles on the first reading heard with a pulse', () => {
    const tracker = createTracker(hysteresis);

    expect(tracker.status()).to.equal('listening');
    expect(tracker.step(input(0.1, null))).to.deep.equal({status: 'listening'});
    expect(tracker.step(input(0.2, 120, {pulse: false}))).to.deep.equal({status: 'listening'});
    expect(tracker.step(input(0.3, 120))).to.deep.equal({status: 'settling', reason: 'first-reading'});
    expect(tracker.step(input(0.4, 121))).to.deep.equal({status: 'settling'});
  });

  it('locks only when the engine offers it, and only from settling', () => {
    const tracker = createTracker(hysteresis);

    // Offered while listening: the first reading comes first
    expect(tracker.step(input(0.1, 120, {lockOffered: true}))).to.deep.equal({status: 'settling', reason: 'first-reading'});
    expect(tracker.step(input(0.2, 120))).to.deep.equal({status: 'settling'});
    expect(tracker.step(input(0.3, 120, {lockOffered: true}))).to.deep.equal({status: 'locked', reason: 'locked'});
  });

  it('holds the lock inside the unlock band, wider than the lock band', () => {
    const tracker = lockedTracker();
    const inside = 120 * (1 + hysteresis.unlockBand) - 0.01;

    expect(hysteresis.unlockBand).to.be.greaterThan(hysteresis.lockBand);
    for (let now = 1.5; now < 10; now += 0.5) {
      expect(tracker.step(input(now, inside))).to.deep.equal({status: 'locked'});
    }
  });

  it('unlocks only after the reading stays outside the band for unlockAfterSeconds', () => {
    const tracker = lockedTracker();
    const outside = 120 * (1 + hysteresis.unlockBand) + 1;

    expect(tracker.step(input(2, outside))).to.deep.equal({status: 'locked'});
    expect(tracker.step(input(2 + hysteresis.unlockAfterSeconds - 0.1, outside))).to.deep.equal({status: 'locked'});
    expect(tracker.step(input(2 + hysteresis.unlockAfterSeconds, outside))).to.deep.equal({status: 'settling', reason: 'unlocked'});
  });

  it('restarts the unlock dwell when the reading comes back inside the band', () => {
    const tracker = lockedTracker();
    const outside = 130;

    tracker.step(input(2, outside));
    tracker.step(input(3, 120));
    expect(tracker.step(input(2 + hysteresis.unlockAfterSeconds, outside))).to.deep.equal({status: 'locked'});
  });

  it('moves the anchor each time the engine confirms the lock, so a slow drift it follows does not unlock', () => {
    const tracker = lockedTracker();

    expect(tracker.step(input(2, 124, {lockOffered: true}))).to.deep.equal({status: 'locked'});
    // 128 is outside 4% of 120 but inside 4% of 124
    expect(tracker.step(input(2 + (2 * hysteresis.unlockAfterSeconds), 128))).to.deep.equal({status: 'locked'});
  });

  it('reports pulse-lost after pulseLostAfterSeconds without a pulse, from settling or locked', () => {
    const tracker = lockedTracker();

    expect(tracker.step(input(1 + hysteresis.pulseLostAfterSeconds - 0.1, 120, {pulse: false}))).to.deep.equal({status: 'locked'});
    expect(tracker.step(input(1 + hysteresis.pulseLostAfterSeconds, 120, {pulse: false}))).to.deep.equal({status: 'listening', reason: 'pulse-lost'});
    expect(tracker.step(input(5, null))).to.deep.equal({status: 'listening'});
    expect(tracker.step(input(5.5, 120))).to.deep.equal({status: 'settling', reason: 'first-reading'});
  });

  it('reports audio-lost once while live input is lost, whatever the status, then settles again', () => {
    const tracker = lockedTracker();

    expect(tracker.step(input(2, 120, {audioLost: true}))).to.deep.equal({status: 'listening', reason: 'audio-lost'});
    expect(tracker.step(input(2.5, 120, {audioLost: true}))).to.deep.equal({status: 'listening'});
    expect(tracker.step(input(3, 120))).to.deep.equal({status: 'settling', reason: 'first-reading'});

    const listening = createTracker(hysteresis);
    expect(listening.step(input(0.5, null, {audioLost: true}))).to.deep.equal({status: 'listening', reason: 'audio-lost'});
  });

  it('turns a lock the live input clock withholds into audio-lost', () => {
    const tracker = createTracker(hysteresis);
    tracker.step(input(0.5, 120));

    expect(tracker.step(input(1, 120, {lockOffered: true, acceptLock: () => false}))).to.deep.equal({status: 'listening', reason: 'audio-lost'});
  });

  it('asks the clock only when about to lock', () => {
    const tracker = createTracker(hysteresis);
    let asked = 0;
    const acceptLock = () => {
      asked += 1;
      return true;
    };

    tracker.step(input(0.5, 120, {acceptLock}));
    tracker.step(input(1, 120, {acceptLock}));
    expect(asked).to.equal(0);
    tracker.step(input(1.5, 120, {lockOffered: true, acceptLock}));
    tracker.step(input(2, 120, {lockOffered: true, acceptLock}));
    expect(asked).to.equal(1);
  });

  it('restarts to listening with the reason from settling or locked, and silently while listening', () => {
    const tracker = lockedTracker();

    expect(tracker.restart('tempo-changed')).to.deep.equal({status: 'listening', reason: 'tempo-changed'});
    expect(tracker.restart('audio-lost')).to.deep.equal({status: 'listening'});
  });

  it('resets to listening silently: the main thread already moved', () => {
    const tracker = lockedTracker();

    tracker.reset();
    expect(tracker.status()).to.equal('listening');
    // A pulse is needed again from the new epoch's start, which `now` restarts from
    expect(tracker.step(input(0.1, 120))).to.deep.equal({status: 'settling', reason: 'first-reading'});
  });
});
