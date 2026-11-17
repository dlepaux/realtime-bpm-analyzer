import {expect} from 'chai';
import {listen, repeatTo, streamPcm} from '../../../benchmark/lib/stream';
import type {Track} from '../../../benchmark/lib/types';
import {createClickTrack} from '../../fixtures/click-track';

describe('repeatTo', () => {
  it('repeats whole passes, so a loop never ends on a cut beat', () => {
    expect([...repeatTo(new Float32Array([1, 2, 3]), 7)]).to.deep.equal([1, 2, 3, 1, 2, 3, 1, 2, 3]);
  });

  it('keeps audio that is already long enough', () => {
    expect([...repeatTo(new Float32Array([1, 2, 3]), 3)]).to.deep.equal([1, 2, 3]);
  });
});

describe('streamPcm', () => {
  const sampleRate = 44_100;

  function clicks(bpm: number, seconds: number): Float32Array {
    const pcm = new Float32Array(seconds * sampleRate);
    const period = Math.round((60 / bpm) * sampleRate);

    for (let start = 0; start + 400 < pcm.length; start += period) {
      for (let i = 0; i < 400; i += 1) {
        pcm[start + i] = (i % 2 === 0 ? 1 : -1) * (1 - (i / 400));
      }
    }

    return pcm;
  }

  async function lastTempo(tempoRange: {min: number; max: number}): Promise<number> {
    let last = 0;

    await streamPcm(clicks(60, 20), sampleRate, {engine: 'tempogram', tempoRange}, message => {
      if (message.type === 'step' && message.status !== 'listening') {
        last = message.reading.bpm;
      }
    }, {priorBpm: 60, priorOctaves: 0.4});

    return last;
  }

  // The sweep and the look measure a range through this path: a tuned run that fell back to the default
  // range would report numbers for a configuration nobody asked for
  it('searches the range in the options when a tuning is given too', async () => {
    expect(await lastTempo({min: 90, max: 180})).to.be.within(90, 180);
    expect(await lastTempo({min: 50, max: 240})).to.be.below(90);
  });
});

describe('listen', () => {
  const track: Track = {set: 'clicks', id: '120', genre: 'click', bpm: 120, group: 'clicks', audioPath: '', licence: 'CC0-1.0'};

  it('keeps the last reading\'s candidates, top first, and its confidence', async function () {
    this.timeout(30_000);
    const result = await listen(track, createClickTrack(120, 44_100, 20), 44_100, {engine: 'tempogram'});

    expect(result.final).to.equal(120);
    expect(result.candidates?.[0]).to.deep.equal([120, 'top']);
    expect(result.confidence).to.be.a('number').within(0, 1);
    expect(result.readings?.at(-1)?.[1]).to.equal(120);
  });
});
