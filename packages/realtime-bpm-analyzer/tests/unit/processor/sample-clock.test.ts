import {expect} from 'chai';
import {createSampleClock, followTrackClock} from '../../../src/core/sample-clock';

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

  // Lost per window rendered is 1 / share - 1, so these are 7.5% and 3.1%: either side of the 5% edge. Close to it the
  // clock flickers (96% render was behind for 20 s of 43), which is why neither case sits closer.
  it('is behind for all of a loss clearly over 5%, and never for one clearly under', () => {
    expect(behindIn({thread: steady(0.93), seconds: 20}).length).to.be.at.least(17);
    expect(behindIn({thread: steady(0.97), seconds: 20}).length).to.equal(0);
  });

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

  it('pays no lump after a long clean stretch: what it pays stays at the pace of the loss', () => {
    const clock = createSampleClock(rate);
    let delivered = 0;
    let run = 0;
    let longestRun = 0;

    const render = (seconds: number) => {
      for (let i = 0; i < seconds * rate / quantum; i += 1) {
        delivered += quantum / rate;

        if (i % 94 === 0) {
          clock.observe(delivered);
        }

        run = clock.advance(quantum) ? run + 1 : 0;
        longestRun = Math.max(longestRun, run);
      }
    };

    render(2);
    // A sliver of a drop leaves under a quantum owed, which nothing pays and which keeps a pace going
    delivered += 0.021;
    render(600);
    longestRun = 0;
    delivered += 0.5;
    render(3);

    // 0.5 s across a 1 s window is about a silent quantum in every two, against hundreds in a row if it saved up
    expect(longestRun).to.be.within(1, 3);
  });

  it('owes no more than 2 s, however long the thread stays below what it can pay', () => {
    const thread = (t: number) => (t < 30 ? 0.4 : 1);
    let afterwards = 0;
    const clock = createSampleClock(rate);
    let delivered = 0;
    let due = 0;
    let nextReport = 0;

    for (let t = 0; t < 40; t += 0.001) {
      delivered += 0.001;
      due += thread(t) * 0.001 * rate;

      if (t >= nextReport) {
        clock.observe(delivered);
        nextReport += 0.25;
      }

      while (due >= quantum) {
        const owes = clock.advance(quantum);

        afterwards += owes && t >= 31 ? quantum : 0;
        due -= quantum;
      }
    }

    expect(afterwards / rate).to.be.at.most(2);
  });

  describe('a window with no report', () => {
    /** At 90% from the start: the reports stop at `until`, and it tells whether the clock would let a lock out at the end */
    function lockAllowedAfter(until: number, seconds = 30, every = 0.25) {
      const clock = createSampleClock(rate);
      let nextReport = 0;

      for (let i = 0; i < seconds * 0.9 * rate / quantum; i += 1) {
        const t = i * quantum / rate / 0.9;

        if (t >= nextReport) {
          if (t < until) {
            clock.observe(t);
          }

          nextReport += every;
        }

        clock.advance(quantum);
      }

      return clock.offerLock();
    }

    it('does not count as clean: reports that stop say nothing, and the clock stays behind', () => {
      expect(lockAllowedAfter(3)).to.equal(false);
    });

    it('does not count as clean with one report a minute either', () => {
      expect(lockAllowedAfter(Number.POSITIVE_INFINITY, 300, 60)).to.equal(false);
    });

    it('lets no lock out once reports have stopped, even before any loss showed', () => {
      expect(lockAllowedAfter(1)).to.equal(false);
    });

    it('does not end being behind: the windows after the reports come back do', () => {
      const clock = createSampleClock(rate);
      let t = 0;

      const render = (seconds: number, share: number, reported: boolean) => {
        for (let i = 0; i < seconds * share * rate / quantum; i += 1) {
          t += quantum / rate / share;

          if (reported && i % 94 === 0) {
            clock.observe(t);
          }

          clock.advance(quantum);
        }
      };

      render(10, 0.9, true);
      expect(clock.isBehind()).to.equal(true);
      render(20, 1, false);
      expect(clock.isBehind()).to.equal(true);
      render(6, 1, true);
      expect(clock.isBehind()).to.equal(false);
    });
  });

  describe('a report that makes no sense', () => {
    /** Behind at 90%, once the given reports have gone in at the start */
    function behindAfter(...first: number[]) {
      const clock = createSampleClock(rate);

      for (const seconds of first) {
        clock.observe(seconds);
      }

      for (let i = 0; i < 20 * 0.9 * rate / quantum; i += 1) {
        if (i % 94 === 0) {
          clock.observe(i * quantum / rate / 0.9);
        }

        clock.advance(quantum);
      }

      return clock.isBehind();
    }

    for (const report of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 1e300, 1e308, 1e6]) {
      it(`can't blind the clock: ${report}`, () => {
        expect(behindAfter(report)).to.equal(true);
      });
    }

    it('makes no clock of itself: reports that are all garbage leave it as if there were none', () => {
      const clock = createSampleClock(rate);

      for (let i = 0; i < 20 * rate / quantum; i += 1) {
        if (i % 94 === 0) {
          clock.observe(Number.NaN);
        }

        expect(clock.advance(quantum)).to.equal(false);
      }

      expect(clock.offerLock()).to.equal(true);
    });

    it('starts over from a counter that steps back, and keeps counting what is lost', () => {
      const clock = createSampleClock(rate);
      let delivered = 100;

      for (let i = 0; i < 20 * 0.9 * rate / quantum; i += 1) {
        if (i === 900) {
          delivered = 0;
        }

        delivered += quantum / rate / 0.9;

        if (i % 94 === 0) {
          clock.observe(delivered);
        }

        clock.advance(quantum);
      }

      expect(clock.isBehind()).to.equal(true);
    });
  });

  describe('a lock published before the loss showed', () => {
    const lossBetween = (from: number, to: number, share: number) => (rendered: number) => (rendered >= from && rendered < to ? share : 1);

    /**
     * Runs the clock with the input on time, offering one lock at `lockAt`, and tells when it was first behind, whether
     * the lock went out, and how often it said to start over. Times are in seconds rendered.
     */
    function lockThenLoss(thread: (rendered: number) => number, seconds: number, lockAt = Number.POSITIVE_INFINITY) {
      const clock = createSampleClock(rate);
      let real = 0;
      let behindFrom: number | null = null;
      let allowed: boolean | null = null;
      let startOvers = 0;

      for (let i = 0; i < seconds * rate / quantum; i += 1) {
        const rendered = i * quantum / rate;

        real += quantum / rate / thread(rendered);

        if (i % 94 === 0) {
          clock.observe(real);
        }

        if (allowed === null && rendered >= lockAt) {
          allowed = clock.offerLock();
        }

        clock.advance(quantum);

        if (behindFrom === null && clock.isBehind()) {
          behindFrom = rendered;
        }

        startOvers += clock.takeStartOver() ? 1 : 0;
      }

      return {behindFrom, allowed, startOvers};
    }

    it('withdraws one published under 3 windows before, and keeps one published more than 3 before', () => {
      const loss = lossBetween(10, 14, 0.85);
      const {behindFrom} = lockThenLoss(loss, 30);

      expect(behindFrom).to.be.a('number');

      const near = lockThenLoss(loss, 30, behindFrom! - 2.5);
      const far = lockThenLoss(loss, 30, behindFrom! - 3.5);

      expect(near.allowed).to.equal(true);
      expect(near.startOvers, '2.5 s before').to.equal(1);
      expect(far.allowed).to.equal(true);
      expect(far.startOvers, '3.5 s before').to.equal(0);
    });

    it('withdraws one from just before a loss that takes longer than 3 windows to reach 0.3 s', () => {
      // 7.5% of each window lost, so 0.3 s takes 4 windows: the lock is judged by when the loss showed, not by how far
      // the loss had got when it reached the floor
      const heard = lockThenLoss(lossBetween(10, 20, 0.93), 40, 9.5);

      expect(heard.behindFrom! - 9.5).to.be.below(3);
      expect(heard.allowed).to.equal(true);
      expect(heard.startOvers).to.equal(1);
    });
  });

  describe('a lock held back while the reports are missing', () => {
    it('starts nothing over until the reports come back, then starts over once', () => {
      const clock = createSampleClock(rate);
      let startOvers = 0;

      // On time throughout. Reports for 2 s, none for 20 s, then reports again.
      for (let i = 0; i < 30 * rate / quantum; i += 1) {
        const t = i * quantum / rate;
        const reported = t < 2 || t >= 22;

        if (reported && i % 94 === 0) {
          clock.observe(t);
        }

        if (i === Math.round(12 * rate / quantum)) {
          expect(clock.offerLock(), 'blind at 12 s').to.equal(false);
        }

        clock.advance(quantum);

        const startsOver = clock.takeStartOver();

        expect(startsOver && !reported, `started over at ${t.toFixed(2)} s with no report`).to.equal(false);
        startOvers += startsOver ? 1 : 0;
      }

      expect(startOvers).to.equal(1);
    });
  });

  describe('reports queued before the first frame', () => {
    type Start = {
      /** Seconds between two queued reports handled, where a context hands them over one by one */
      drain?: number;
      /** Whether the main thread posts no report at a time, as when it's busy */
      quiet?: (t: number) => boolean;
    };

    /**
     * The input delivers from 0 s and reports every 250 ms, but the thread renders from `start` only. The reports
     * posted before that wait on the port and are all handled at the first quantum, as a context that is still
     * starting does (measured: three at once, then the gap steady at 0.87 s). After it, each is handled as it's posted.
     */
    function startLate(start: number, thread: (t: number) => number, seconds = 12, {drain = 0, quiet = () => false}: Start = {}) {
      const clock = createSampleClock(rate);
      const step = 0.001;
      const posted: number[] = [];
      let nextReport = 0.25;
      let nextHandled = start;
      let due = 0;
      let owed = 0;
      let startOvers = 0;
      const behind = new Set<number>();

      for (let t = 0; t < seconds; t += step) {
        for (; t >= nextReport; nextReport += 0.25) {
          if (!quiet(nextReport)) {
            posted.push(nextReport);
          }
        }

        if (t < start) {
          continue;
        }

        due += thread(t) * step * rate;

        while (posted.length > 0 && t >= nextHandled) {
          clock.observe(posted.shift()!);
          nextHandled = t + drain;
        }

        while (due >= quantum) {
          owed += clock.advance(quantum) ? quantum : 0;
          startOvers += clock.takeStartOver() ? 1 : 0;
          due -= quantum;

          if (clock.isBehind()) {
            behind.add(Math.floor(t));
          }
        }
      }

      return {owed: owed / rate, startOvers, behind: [...behind]};
    }

    const none = {owed: 0, startOvers: 0, behind: []};

    it('books none of them as lost, wherever the first frame falls between two reports', () => {
      // Every 10 ms from two reports queued to nine: the oldest up to 2 s old, and the newest anywhere up to 250 ms
      for (let start = 0.51; start <= 2.3; start += 0.01) {
        expect(startLate(start, () => 1), `from ${start.toFixed(2)} s`).to.deep.equal(none);
      }
    });

    it('books none of them as lost when they are handed over one by one, up to 40 ms apart', () => {
      for (const drain of [0.01, 0.025, 0.04]) {
        expect(startLate(0.87, () => 1, 12, {drain}), `${drain * 1000} ms apart`).to.deep.equal(none);
      }
    });

    it('books the age of a single one as lost, which starts nothing over: it can\'t be told from a report on time', () => {
      for (let start = 0.26; start < 0.5; start += 0.01) {
        const late = startLate(start, () => 1);

        expect(late.startOvers, `from ${start.toFixed(2)} s`).to.equal(0);
        expect(late.owed, `from ${start.toFixed(2)} s`).to.be.below(0.25);
      }
    });

    it('pays a loss from the first frame as it would without them, but for one report\'s interval of it', () => {
      for (const share of [0.9, 0.8, 0.7, 0.6]) {
        // The same 20 s of rendering, from a first frame with three reports queued, and from one with none
        const queued = startLate(0.87, () => share, 20.87);
        const onTime = startLate(0.2, () => share, 20.2);

        expect(queued.owed, `at ${share}`).to.be.closeTo(onTime.owed, (1 - share) * 0.25 + 0.03);
        expect(queued.behind.length, `at ${share}`).to.be.above(10);
      }
    });

    it('follows no report that comes long after them: a loss while the main thread is quiet is still paid', () => {
      const quiet = (t: number) => t > 0.87 && t < 3;
      const late = startLate(0.87, () => 0.9, 20, {quiet});
      const onTime = startLate(0.87, () => 0.9, 20);

      // The quiet spell loses 0.21 s, all of it paid, where following the next report would have hidden it. The
      // queue's age is paid on top, as for a single early report: under a report's interval
      expect(late.owed).to.be.within(onTime.owed - 0.03, onTime.owed + 0.25);
      expect(late.behind).to.include.members([4, 8, 16]);
    });

    it('still pays a loss that comes after them, and is behind for it', () => {
      const late = startLate(0.87, t => (t < 4 ? 1 : 0.9), 20);

      expect(late.behind).to.include.members([8, 12, 16]);
      expect(late.behind.every(second => second >= 4)).to.equal(true);
      expect(late.owed).to.be.closeTo((20 - 4.87) * 0.1, 0.3);
    });

    it('still starts over for a loss past 0.3 s that comes after them, and not for one under it', () => {
      // 0.4 s lost, then 0.2 s lost, in two spells 1 s long after start-up
      expect(startLate(0.87, t => (t >= 4 && t < 5 ? 0.6 : 1)).startOvers).to.equal(1);
      expect(startLate(0.87, t => (t >= 4 && t < 5 ? 0.8 : 1)).startOvers).to.equal(0);
    });
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

  it('reports only finite counts', () => {
    const reports: number[] = [];
    const stats = {totalFramesDuration: Number.NaN};
    followTrackClock({readyState: 'live', stats} as unknown as MediaStreamTrack, s => reports.push(s));

    for (const duration of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 2000]) {
      stats.totalFramesDuration = duration;
      tick!();
    }

    expect(reports).to.deep.equal([2]);
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
