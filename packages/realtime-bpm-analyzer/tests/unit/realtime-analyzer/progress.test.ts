import {expect} from 'chai';
import {createSession} from '../../../src/core/session';
import type {ResolvedEngine} from '../../../src/core/engine';
import {computeProgress} from '../../../src/core/tempo';
import {requiredPeaks} from '../../../src/core/consts';
import {createClickTrack} from '../../fixtures/click-track';
import {feedSession, stepsOf} from '../../setup';

const bufferSize = 4096;
const audioSampleRate = 44_100;

async function analyze(samples: Float32Array, engine: ResolvedEngine = {name: 'peaks'}) {
  const session = createSession({engine, tempoRange: {min: 90, max: 180}, debug: false});
  return stepsOf(await feedSession(session, samples, audioSampleRate, bufferSize));
}

describe('peaks engine - progress toward the first reading', () => {
  it('is the share of the peaks needed, one more than computeBpm\'s minimum', () => {
    expect(computeProgress({})).to.equal(0);
    expect(computeProgress({0.9: [1, 2], 0.5: [1, 2, 3]})).to.equal(3 / requiredPeaks);
    expect(computeProgress({0.9: Array.from({length: 40}, (_, i) => i)})).to.equal(1);
  });

  it('rises on a click track, one step per buffer, and gives way to the first reading', async () => {
    const steps = await analyze(createClickTrack(120, audioSampleRate, 15));
    const firstReading = steps.findIndex(step => step.status === 'settling');
    const listening = steps.slice(0, firstReading).map(step => (step.status === 'listening' ? step.progress : -1));

    expect(firstReading).to.be.greaterThan(0);
    expect(steps[firstReading].reason).to.equal('first-reading');
    expect(listening.length).to.be.greaterThan(1);
    for (let i = 1; i < listening.length; i++) {
      expect(listening[i]).to.be.at.least(listening[i - 1]);
    }

    expect(listening.every(progress => progress >= 0 && progress <= 1)).to.equal(true);
  });

  it('stays at 0 on silence, and never leaves listening', async () => {
    const steps = await analyze(new Float32Array(audioSampleRate * 5));

    expect(steps.length).to.be.greaterThan(0);
    for (const step of steps) {
      expect(step.status).to.equal('listening');
      expect(step.status === 'listening' && step.progress).to.equal(0);
    }
  });

  it('drops to 0 when the engine restarts for a tempo change', async () => {
    const steps = await analyze(createClickTrack(120, audioSampleRate, 15), {name: 'peaks', restartAfterSeconds: 10});
    const restart = steps.find(step => step.reason === 'tempo-changed');

    expect(restart?.status).to.equal('listening');
    expect(restart?.status === 'listening' && restart.progress).to.equal(0);
  });
});
