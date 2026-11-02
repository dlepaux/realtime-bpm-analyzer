import {expect} from 'chai';
import {createSampleClock, followTrackClock} from '../../../src/core/sample-clock';
import {RealTimeBpmAnalyzer} from '../../../src/core/realtime-bpm-analyzer';

const rate = 48_000;
const quantum = 128;

type Scenario = {
  /** The thread's share of real time, and the input's, at a time in seconds */
  thread: (t: number) => number;
  input?: (t: number) => number;
  seconds: number;
  /** Quanta rendered at once, as a device asking for many does */
  burst?: number;
  /** How late a report may reach the thread, in seconds */
  late?: (t: number) => number;
};

/** Runs the clock with a thread and an input at their own pace, with a report every 250 ms. */
function run({thread, input = () => 1, seconds, burst = 1, late = () => 0}: Scenario, onSecond?: (t: number, behind: boolean) => void): number {
  const clock = createSampleClock(rate);
  const step = 0.001;
  const reports: {at: number; delivered: number}[] = [];
  let delivered = 0;
  let due = 0;
  let nextReport = 0;
  let owed = 0;
  let nextSecond = 0;

  for (let t = 0; t < seconds; t += step) {
    if (t >= nextSecond) {
      onSecond?.(t, clock.isBehind());
      nextSecond += 1;
    }

    delivered += input(t) * step;
    due += thread(t) * step * rate;

    if (t >= nextReport) {
      reports.push({at: t + late(t), delivered});
      nextReport += 0.25;
    }

    while (reports[0] && reports[0].at <= t) {
      clock.observe(reports.shift()!.delivered);
    }

    while (due >= burst * quantum) {
      for (let i = 0; i < burst; i += 1) {
        owed += clock.advance(quantum) ? quantum : 0;
      }

      due -= burst * quantum;
    }
  }

  return owed;
}

/** The frames owed */
const owedIn = (scenario: Scenario): number => run(scenario);

/** When the clock said it was behind, by the second */
function behindIn(scenario: Scenario): number[] {
  const seconds: number[] = [];

  run(scenario, (t, behind) => {
    if (behind) {
      seconds.push(Math.round(t));
    }
  });

  return seconds;
}

const steady = (share: number) => () => share;

describe('createSampleClock', () => {
  for (const pause of [0.9, 5]) {
    it(`still pays what is lost after the input pauses for ${pause} s`, () => {
      const owed = owedIn({
        thread: t => (t < 60 ? 0.95 : 0.9),
        input: t => (t >= 60 && t < 60 + pause ? 0 : 1),
        seconds: 120,
      });

      // 3 s up to the pause and 6 s after it, in thread time and at the pace it was lost
      expect(owed / rate).to.be.closeTo(9, 1);
    });
  }

  it('is behind while time is lost, at a rate that shows, and not after', () => {
    expect(behindIn({thread: () => 1, seconds: 20}).length).to.equal(0);
    expect(behindIn({thread: steady(0.98), seconds: 20}).length).to.equal(0);

    const behind = behindIn({thread: t => (t < 20 ? 0.9 : 1), seconds: 40});

    expect(behind[0]).to.be.at.most(4);
    expect(behind.at(-1)).to.be.within(20, 26);
  });

  for (const share of [0.45, 0.3]) {
    it(`is behind at ${share * 100}%, where the silence owed can't be paid`, () => {
      const behind = behindIn({thread: steady(share), seconds: 30});

      expect(behind.length).to.be.greaterThan(15);
    });
  }

  it('is not behind for reports that arrive late', () => {
    expect(behindIn({thread: () => 1, seconds: 30, late: t => (Math.floor(t) % 2 === 0 ? 0.015 : 0)}).length).to.equal(0);
  });

  it('owes nothing until the input reports: without a clock, nothing changes', () => {
    const clock = createSampleClock(rate);

    for (let i = 0; i < 60 * rate / quantum; i += 1) {
      expect(clock.advance(quantum)).to.equal(false);
    }
  });

  it('owes nothing to a thread on time, including a device asking for many quanta at once', () => {
    expect(owedIn({thread: steady(1), seconds: 60})).to.equal(0);
    // A report can land on either side of a burst: that much, once, and it doesn't add up over a minute
    expect(owedIn({thread: steady(1), seconds: 60, burst: 8})).to.be.lessThan(8 * quantum);
    expect(owedIn({thread: steady(1), seconds: 60, burst: 32})).to.be.lessThan(32 * quantum);
  });

  it('owes what a thread behind its input has lost, once a window has passed', () => {
    for (const share of [0.98, 0.95, 0.9, 0.85]) {
      const lost = 30 * (1 - share) * rate;

      expect(owedIn({thread: steady(share), seconds: 30}), `at ${share}`).to.be.closeTo(lost, 3 * (1 - share) * rate + 0.03 * rate);
    }
  });

  it('owes nothing when the input slows with the thread: the whole browser short of CPU loses no audio', () => {
    for (const share of [0.95, 0.9, 0.8, 0.7]) {
      expect(owedIn({thread: steady(share), input: steady(share), seconds: 30}), `at ${share}`).to.equal(0);
    }
  });

  it('owes nothing for a stall the thread recovers from', () => {
    // Every 3 s it stops for 500 ms, then renders what it missed at three times the pace
    const thread = (t: number) => (t % 3 < 0.5 ? 0 : t % 3 < 0.75 ? 3 : 1);

    expect(owedIn({thread, seconds: 20})).to.equal(0);
  });

  it('owes nothing for reports held up by a busy main thread', () => {
    // Half a second late, one second in every four
    expect(owedIn({thread: steady(1), seconds: 40, late: t => (t % 4 >= 3 ? 0.5 : 0)})).to.equal(0);
  });

  it('still owes what was lost when reports come late', () => {
    const lost = 30 * 0.1 * rate;

    expect(owedIn({thread: steady(0.9), seconds: 30, late: t => (t % 4 >= 3 ? 0.5 : 0)})).to.be.closeTo(lost, 0.5 * rate);
  });

  it('starts over after a long gap: a context suspended or a laptop asleep owes nothing', () => {
    const thread = (t: number) => (t > 5 && t < 15 ? 0 : 1);

    expect(owedIn({thread, seconds: 25})).to.equal(0);
  });

  it('banks nothing from an input that paused, and pays what is lost afterwards', () => {
    const input = (t: number) => (t < 10 ? 0 : 1);
    const thread = (t: number) => (t < 20 ? 1 : 0.9);
    const lost = 10 * 0.1 * rate;

    expect(owedIn({thread, input, seconds: 30})).to.be.closeTo(lost, 0.3 * rate);
  });

  it('gives up when nearly nothing renders: there is no tempo to protect', () => {
    expect(owedIn({thread: steady(0.3), seconds: 60})).to.equal(0);
  });
});

describe('followTrackClock', () => {
  const realSetInterval = globalThis.setInterval;
  const realClearInterval = globalThis.clearInterval;
  let tick: (() => void) | null;

  beforeEach(() => {
    tick = null;
    (globalThis as any).setInterval = (fn: () => void) => {
      tick = fn;
      return 1;
    };

    (globalThis as any).clearInterval = () => {
      tick = null;
    };
  });

  afterEach(() => {
    globalThis.setInterval = realSetInterval;
    globalThis.clearInterval = realClearInterval;
  });

  it('reports seconds by the track\'s own clock, until told to stop', () => {
    const reports: number[] = [];
    const track = {readyState: 'live', stats: {totalFramesDuration: 1500}} as unknown as MediaStreamTrack;
    const stop = followTrackClock(track, s => reports.push(s));

    tick!();
    expect(reports).to.deep.equal([1.5]);
    stop();
    expect(tick).to.equal(null);
  });

  it('stops by itself when the track ends', () => {
    const reports: number[] = [];
    const track = {readyState: 'ended', stats: {totalFramesDuration: 1500}} as unknown as MediaStreamTrack;

    followTrackClock(track, s => reports.push(s));
    tick!();
    expect(reports).to.deep.equal([]);
    expect(tick).to.equal(null);
  });

  it('does nothing in a browser that does not count', () => {
    followTrackClock({readyState: 'live'} as unknown as MediaStreamTrack, () => {
      throw new Error('no report expected');
    })();
    expect(tick).to.equal(null);
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
  const clock = createSampleClock(rate);
  const audio = groove(bpm, 45);
  const silent = new Float32Array(quantum);
  const buffer = new Float32Array(4096);
  const lostEvery = 480 / (1 - share);
  const result: {top?: number; stable: number[]} = {stable: []};
  let written = 0;
  let quanta = 0;
  let nextLost = lostEvery;
  let nextReport = 0;
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

          if (event.type === 'bpmStable' && event.data.bpm[0] && !(kept && clock.isBehind())) {
            result.stable.push(event.data.bpm[0].tempo);
          }
        },
      });
    }
  };

  while (at + quantum < audio.length) {
    // The input keeps real time, reported every 250 ms of it, while the thread runs at its share
    const realSeconds = (quanta * quantum) / rate / share;

    if (realSeconds >= nextReport) {
      clock.observe(realSeconds);
      nextReport += 0.25;
    }

    const owes = clock.advance(quantum);

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

        // Paid silence gets the number back, but a lock heard meanwhile isn't called stable.
        if (share < 0.95) {
          expect(held.stable.length, `${bpm} at ${share}`).to.equal(0);
        }

        for (const stable of held.stable) {
          expect(stable, `${bpm} at ${share}`).to.be.closeTo(bpm, 1);
        }
      }
    });
  }
});
