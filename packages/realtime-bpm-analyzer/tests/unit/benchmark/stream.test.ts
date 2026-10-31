import {expect} from 'chai';
import {repeatTo, streamPcm} from '../../../benchmark/lib/stream';

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

  async function lastTempo(tempoRange: {min: number; max: number} | undefined): Promise<number> {
    let last = 0;

    await streamPcm(clicks(60, 20), sampleRate, {detector: 'tempogram', tempoRange}, event => {
      if (event.type === 'bpm' && event.data.bpm[0]) {
        last = event.data.bpm[0].tempo;
      }
    }, {priorBpm: 60, priorOctaves: 0.4});

    return last;
  }

  // The sweep and the look measure the extension's range through this path: a tuned run that fell back
  // to the wide range would report numbers for a configuration nobody asked for
  it('searches the range in the options when a tuning is given too', async () => {
    expect(await lastTempo({min: 90, max: 180})).to.be.within(90, 180);
    expect(await lastTempo(undefined)).to.be.below(90);
  });
});
