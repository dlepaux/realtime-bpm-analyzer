import {expect} from 'chai';
import {createSampleClock} from '../../../src/core/sample-clock';
import {RealTimeBpmAnalyzer} from '../../../src/core/realtime-bpm-analyzer';

const rate = 48_000;
const quantum = 128;

/** Runs the clock over `seconds` with the thread at `share` of real time; returns the frames of silence it owed. */
function owedAt(share: number, seconds: number, jitterQuanta = 1): number {
  const advance = createSampleClock(rate);
  let owed = 0;

  for (let i = 0; i * quantum < seconds * rate * share; i += 1) {
    // A device asks for several quanta at once: they all run at the time of the first
    const burst = Math.floor(i / jitterQuanta) * jitterQuanta;
    const now = ((burst * quantum) / rate / share) * 1000;

    owed += advance(now, quantum) ? quantum : 0;
  }

  return owed;
}

describe('createSampleClock', () => {
  it('owes nothing to a thread on time, including a device asking for many quanta at once', () => {
    expect(owedAt(1, 60)).to.equal(0);
    expect(owedAt(1, 60, 8)).to.equal(0);
    expect(owedAt(1, 60, 32)).to.equal(0);
  });

  it('owes what a thread behind has lost, once a window has passed', () => {
    for (const share of [0.98, 0.95, 0.9, 0.85]) {
      const lost = 30 * (1 - share) * rate;
      const owed = owedAt(share, 30);

      expect(owed, `at ${share}`).to.be.closeTo(lost, 2 * (1 - share) * rate + 0.02 * rate);
    }
  });

  it('owes nothing for a stall the thread recovers from', () => {
    const advance = createSampleClock(rate);
    let now = 0;
    let owed = 0;

    for (let i = 0; i < 20 * rate / quantum; i += 1) {
      // Every 3 s of audio it stops for 500 ms, and then renders what it missed as fast as it can
      const audioMs = ((i * quantum) / rate) * 1000;
      const stalled = audioMs % 3000 < 3;

      now = Math.max(now, audioMs) + (stalled ? 500 : 0);
      owed += advance(now, quantum) ? quantum : 0;
    }

    expect(owed).to.equal(0);
  });

  it('starts over after a long gap: a laptop asleep owes nothing', () => {
    const advance = createSampleClock(rate);
    let owed = 0;

    for (let i = 0; i < 5 * rate / quantum; i += 1) {
      owed += advance(((i * quantum) / rate) * 1000, quantum) ? quantum : 0;
    }

    for (let i = 0; i < 5 * rate / quantum; i += 1) {
      owed += advance(3_600_000 + (((i * quantum) / rate) * 1000), quantum) ? quantum : 0;
    }

    expect(owed).to.equal(0);
  });

  it('banks nothing from a device running ahead of the system clock', () => {
    const fast = createSampleClock(rate);
    let owed = 0;
    let now = 0;

    for (let i = 0; i < 10 * rate / quantum; i += 1) {
      now = (((i * quantum) / rate) * 1000) / 1.01;
      owed += fast(now, quantum) ? quantum : 0;
    }

    // Then a share behind: what it is owed starts from there, not from what it gained
    for (let i = 0; i < 10 * rate / quantum; i += 1) {
      now += (((quantum / rate) * 1000) / 0.9);
      owed += fast(now, quantum) ? quantum : 0;
    }

    expect(owed).to.be.closeTo(10 * 0.1 * rate / 0.9, 0.3 * rate);
  });

  it('stops growing what it owes when nearly nothing renders', () => {
    const advance = createSampleClock(rate);
    let now = 0;
    let owed = 0;

    for (let i = 0; i < 2000; i += 1) {
      now += 20;
      owed += advance(now, quantum) ? 1 : 0;
    }

    expect(owed).to.be.greaterThan(0);
    expect(owed * quantum).to.be.lessThan(2000 * quantum);
  });
});

/** A groove: kick and hat, at a tempo. */
function groove(bpm: number, seconds: number): Float32Array {
  const out = new Float32Array(seconds * rate);
  const beat = (60 / bpm) * rate;

  for (let b = 0; Math.round(b * beat) < out.length; b += 1) {
    const at = Math.round(b * beat);

    for (let i = 0; i < 5000 && at + i < out.length; i += 1) {
      out[at + i] += 0.8 * Math.sin(2 * Math.PI * 60 * i / rate) * Math.exp(-i / 2000);
    }
  }

  return out;
}

/**
 * What the worklet feeds the analyzer when the thread runs at `share`, as the browser does it: whole 10 ms
 * buffers of the input go missing, and with `kept` the clock puts silence back.
 */
async function reading(detector: 'peaks' | 'tempogram', bpm: number, share: number, kept: boolean): Promise<{top?: number; stable: number[]}> {
  const analyzer = new RealTimeBpmAnalyzer(detector === 'tempogram' ? {detector, tempogramMode: 'extension'} : {detector});
  const advance = createSampleClock(rate);
  const audio = groove(bpm, 45);
  const silent = new Float32Array(quantum);
  const buffer = new Float32Array(4096);
  const lostEvery = 480 / (1 - share);
  const result: {top?: number; stable: number[]} = {stable: []};
  let written = 0;
  let quanta = 0;
  let nextLost = lostEvery;
  let at = 0;

  const feed = async (chunk: Float32Array) => {
    buffer.set(chunk, written);
    written += chunk.length;

    if (written === buffer.length) {
      written = 0;
      await analyzer.analyzeChunk({
        audioSampleRate: rate,
        channelData: buffer,
        bufferSize: buffer.length,
        postMessage(event) {
          if (event.type === 'bpm' && event.data.bpm[0]) {
            result.top = event.data.bpm[0].tempo;
          }

          if (event.type === 'bpmStable' && event.data.bpm[0]) {
            result.stable.push(event.data.bpm[0].tempo);
          }
        },
      });
    }
  };

  while (at + quantum < audio.length) {
    const owes = advance(((quanta * quantum) / rate / share) * 1000, quantum);

    quanta += 1;

    if (kept && owes) {
      await feed(silent);
    }

    await feed(audio.subarray(at, at + quantum));
    at += quantum;

    if (at >= nextLost) {
      at += 480;
      nextLost += lostEvery;
    }
  }

  return result;
}

describe('A thread that keeps falling behind a live input', () => {
  for (const detector of ['tempogram', 'peaks'] as const) {
    it(`${detector}: reads high and stable without the clock, right with it`, async function () {
      this.timeout(60_000);

      const without = await reading(detector, 120, 0.9, false);

      expect(without.top).to.be.closeTo(133, 2);
      expect(without.stable.at(-1)).to.be.closeTo(133, 2);

      for (const [bpm, share] of [[150, 0.9], [120, 0.9], [120, 0.98], [120, 0.85]] as const) {
        const held = await reading(detector, bpm, share, true);

        expect(held.top, `${bpm} at ${share}`).to.be.closeTo(bpm, 1);

        for (const stable of held.stable.slice(1)) {
          expect(stable, `${bpm} at ${share}`).to.be.closeTo(bpm, 1);
        }
      }
    });
  }
});
