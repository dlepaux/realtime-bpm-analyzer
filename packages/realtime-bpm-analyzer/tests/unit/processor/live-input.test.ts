import {expect} from 'chai';

async function loadProcessorModule(): Promise<any> {
  (globalThis as any).sampleRate = 48_000;
  (globalThis as any).AudioWorkletProcessor = class {
    port = {
      postMessage() {
        // No-op stub
      },
      addEventListener() {
        // No-op stub
      },
      start() {
        // No-op stub
      },
    };
  };

  (globalThis as any).registerProcessor = () => {
    // No-op stub
  };

  return import('../../../src/processor/realtime-bpm-processor');
}

const quantum = 128;
const sampleRate = 48_000;

describe('RealTimeBpmProcessor - a live input\'s clock', () => {
  let RealTimeBpmProcessor: any;

  before(async () => {
    const mod = await loadProcessorModule();
    RealTimeBpmProcessor = mod.RealTimeBpmProcessor;
  });

  /** Renders `seconds` at `threadShare` of the input's pace, reporting it or not, and tells what reached the analyzer */
  function render(threadShare: number, seconds: number, {reported = true, connected = true} = {}) {
    const processor = new RealTimeBpmProcessor({numberOfInputs: 1, numberOfOutputs: 1, processorOptions: {}});
    const heard = {input: 0, silence: 0};
    const input = new Float32Array(quantum).fill(0.5);
    processor.aggregate = (pcmData: Float32Array) => {
      heard[pcmData[0] === 0 ? 'silence' : 'input'] += pcmData.length;
      return {isBufferFull: false, buffer: pcmData, bufferSize: 4096};
    };

    const quanta = Math.round((seconds * threadShare * sampleRate) / quantum);
    const reportEvery = Math.round((0.25 * threadShare * sampleRate) / quantum);
    for (let i = 0; i < quanta; i++) {
      if (reported && i % reportEvery === 0) {
        processor.onMessage({data: {type: 'delivered', seconds: (i * quantum) / sampleRate / threadShare}});
      }

      expect(processor.process(connected ? [[input]] : [[]], [[]], {})).to.equal(true);
    }

    return heard;
  }

  it('should add no silence with no report, whatever the thread does', () => {
    expect(render(0.9, 10, {reported: false}).silence).to.equal(0);
  });

  it('should add no silence when the thread keeps up', () => {
    expect(render(1, 10).silence).to.equal(0);
  });

  it('should pay the audio the thread lost as silence, on top of all of the input', () => {
    const heard = render(0.9, 10);
    const lost = 10 * sampleRate * 0.1;
    expect(heard.input).to.be.closeTo(9 * sampleRate, quantum);
    // The last windows are still to be paid
    expect(heard.silence).to.be.within(lost * 0.65, lost);
  });

  it('should pay nothing while no input is connected, and not fail', () => {
    const heard = render(0.9, 10, {connected: false});
    expect(heard.input + heard.silence).to.equal(0);
  });
});

/** A kick on each beat: enough for both detectors */
function groove(bpm: number, seconds: number): Float32Array {
  const out = new Float32Array(Math.ceil(seconds * sampleRate));
  const beat = (60 / bpm) * sampleRate;

  for (let b = 0; Math.round(b * beat) < out.length; b += 1) {
    const at = Math.round(b * beat);

    for (let i = 0; i < 5000 && at + i < out.length; i += 1) {
      out[at + i] += 0.8 * Math.sin(2 * Math.PI * 60 * i / sampleRate) * Math.exp(-i / 2000);
    }
  }

  return out;
}

type Detector = 'tempogram' | 'peaks';

type Heard = {
  /** What the main thread was told, with the time it was told */
  readonly stable: ReadonlyArray<{at: number; tempo: number}>;
  readonly resets: readonly number[];
  readonly messages: readonly string[];
  /** The last `bpm` reading */
  readonly top: number | undefined;
  readonly silent: number;
};

type Listening = {
  detector?: Detector;
  bpm: number;
  seconds: number;
  /** The thread's share of real time, at a real time */
  share?: (t: number) => number;
  /** What the track's clock reports at a real time, or nothing */
  report?: (t: number) => number | undefined;
  /** Runs at each quantum, at a real time */
  during?: (processor: any, t: number) => void;
};

const onTime = (t: number) => t;
const lossBetween = (from: number, to: number, share: number) => (t: number) => (t >= from && t < to ? share : 1);

describe('RealTimeBpmProcessor - real analysis of a live input losing audio', () => {
  let RealTimeBpmProcessor: any;

  before(async () => {
    RealTimeBpmProcessor = (await loadProcessorModule()).RealTimeBpmProcessor;
  });

  /**
   * The real processor and the real analysis, on generated audio. What is modelled is the browser: whole 10 ms buffers
   * of the input go missing as the thread falls behind, and the track's clock reports every 250 ms in steps of 10 ms.
   */
  async function listen({detector = 'tempogram', bpm, seconds, share = () => 1, report = onTime, during}: Listening): Promise<Heard> {
    const options = detector === 'tempogram' ? {detector, tempogramMode: 'extension'} : {detector};
    const processor = new RealTimeBpmProcessor({numberOfInputs: 1, numberOfOutputs: 1, processorOptions: options});
    const audio = groove(bpm, seconds * 1.3);
    const stable: Array<{at: number; tempo: number}> = [];
    const resets: number[] = [];
    const messages: string[] = [];
    let top: number | undefined;
    let real = 0;
    let at = 0;
    let dropping = 0;
    let nextReport = 0;
    let silent = 0;

    processor.port.postMessage = (message: any) => {
      messages.push(message.type);

      if (message.type === 'bpm' && message.data.bpm[0]) {
        top = message.data.bpm[0].tempo;
      }

      if (message.type === 'bpmStable') {
        stable.push({at: real, tempo: message.data.bpm[0].tempo});
      }

      if (message.type === 'analyzerReset') {
        resets.push(real);
      }
    };

    const aggregate = processor.aggregate;

    processor.aggregate = (chunk: Float32Array) => {
      silent += chunk === processor.silentQuantum ? chunk.length : 0;

      return aggregate(chunk);
    };

    while (real < seconds) {
      const elapsed = quantum / sampleRate / share(real);

      real += elapsed;
      dropping += elapsed - (quantum / sampleRate);

      while (dropping >= 0.01) {
        at += 480;
        dropping -= 0.01;
      }

      if (real >= nextReport) {
        nextReport += 0.25;
        const seconds = report(real);

        if (seconds !== undefined) {
          processor.onMessage({data: {type: 'delivered', seconds: Math.floor(seconds * 100) / 100}});
        }
      }

      during?.(processor, real);
      processor.process([[audio.subarray(at, at + quantum)]], [[]], {});
      at += quantum;

      // A real thread lets an analysis finish before the next quantum
      for (let i = 0; processor.analysisInProgress && i < 100_000; i += 1) {
        await Promise.resolve();
      }

      expect(processor.analysisInProgress).to.equal(false);
    }

    return {stable, resets, messages, top, silent};
  }

  for (const detector of ['tempogram', 'peaks'] as const) {
    describe(detector, () => {
      it('with no loss: locks on the tempo, and starts nothing over', async function () {
        this.timeout(60_000);
        const heard = await listen({detector, bpm: 150, seconds: 30});

        expect(heard.stable.map(s => s.tempo)[0]).to.be.closeTo(150, 1);
        expect(heard.resets).to.deep.equal([]);
        expect(heard.silent).to.equal(0);
      });

      it('with the track reporting nothing at all: nothing changes, and the reading is as high as the loss', async function () {
        this.timeout(60_000);
        const heard = await listen({detector, bpm: 120, seconds: 30, share: () => 0.9, report: () => undefined});

        expect(heard.stable.length).to.be.greaterThan(0);
        expect(heard.stable[0].tempo).to.be.closeTo(133, 2);
        expect(heard.silent).to.equal(0);
      });

      for (const [bpm, share] of [[150, 0.9], [120, 0.9], [120, 0.85]] as const) {
        it(`withholds bpmStable through a loss that doesn't end, and reads ${bpm}: ${share * 100}% render`, async function () {
          this.timeout(60_000);
          const heard = await listen({detector, bpm, seconds: 35, share: () => share});

          expect(heard.stable).to.deep.equal([]);
          expect(heard.top).to.be.closeTo(bpm, 1);
          expect(heard.silent).to.be.greaterThan(0);
        });
      }

      it('withholds a lock over the 5% edge (93%), and keeps one under it (98%)', async function () {
        this.timeout(60_000);

        expect((await listen({detector, bpm: 150, seconds: 30, share: () => 0.93})).stable).to.deep.equal([]);

        const under = await listen({detector, bpm: 150, seconds: 30, share: () => 0.98});

        expect(under.stable.length).to.be.greaterThan(0);
        expect(under.stable[0].tempo).to.be.closeTo(150, 1);
      });

      for (const [from, to, share] of [[0, 6, 0.85], [0, 7, 0.85], [3, 8, 0.9]] as const) {
        for (const bpm of [150, 120]) {
          it(`starts over when a loss ends before the first lock, and locks on what follows: ${bpm}, ${share * 100}% during ${from} to ${to} s`, async function () {
            this.timeout(60_000);
            const heard = await listen({detector, bpm, seconds: 35, share: lossBetween(from, to, share)});

            expect(heard.resets.length).to.equal(1);
            expect(heard.resets[0]).to.be.greaterThan(to);
            expect(heard.stable.length).to.be.greaterThan(0);
            expect(heard.stable[0].at, 'a lock came before the analyzer started over').to.be.greaterThan(heard.resets[0]);

            for (const {tempo} of heard.stable) {
              expect(tempo).to.be.closeTo(bpm, 1);
            }
          });
        }
      }

      it('relocks after a loss long enough to have withheld a lock', async function () {
        this.timeout(60_000);
        const heard = await listen({detector, bpm: 150, seconds: 45, share: lossBetween(0, 20, 0.9)});

        expect(heard.resets.length).to.equal(1);
        expect(heard.resets[0]).to.be.greaterThan(20);
        expect(heard.stable.length).to.be.greaterThan(0);
        expect(heard.stable[0].at).to.be.greaterThan(heard.resets[0]);
        expect(heard.stable[0].tempo).to.be.closeTo(150, 1);
      });

      it('tells the main thread it started over, and progress falls with it', async function () {
        this.timeout(60_000);
        const {messages} = await listen({detector, bpm: 150, seconds: 15, share: lossBetween(0, 6, 0.85)});
        const reset = messages.indexOf('analyzerReset');

        expect(reset).to.be.greaterThan(-1);
        expect(messages[reset + 1]).to.equal('progress');
      });

      it('leaves a lock from before the loss alone: nothing to start over for', async function () {
        this.timeout(60_000);
        const heard = await listen({detector, bpm: 150, seconds: 40, share: lossBetween(16, 26, 0.9)});

        expect(heard.stable[0].at).to.be.lessThan(16);
        expect(heard.resets).to.deep.equal([]);
      });

      it('starts nothing over for a small drop before the first lock: it reads right', async function () {
        this.timeout(60_000);
        // 75 ms lost and 200 ms: over the 5% of a window, under what a lock can't stand on. Early enough for neither
        // detector to lock in the 4 s it is behind, since that lock would be withheld and start over.
        for (const share of [0.8, 0.6]) {
          const heard = await listen({detector, bpm: 150, seconds: 25, share: lossBetween(1, 1.3, share)});

          expect(heard.resets, `at ${share}`).to.deep.equal([]);
          expect(heard.stable[0].at, `at ${share}`).to.be.lessThan(13);
          expect(heard.stable[0].tempo, `at ${share}`).to.be.closeTo(150, 1);
        }
      });

      it('forgets the loss when the caller resets: nothing left to start over for', async function () {
        this.timeout(60_000);
        let resetSent = false;
        const heard = await listen({
          detector,
          bpm: 150,
          seconds: 15,
          share: lossBetween(0, 6, 0.85),
          during(processor, t) {
            if (t > 6 && !resetSent) {
              resetSent = true;
              processor.onMessage({data: {type: 'reset'}});
            }
          },
        });

        expect(heard.resets).to.deep.equal([]);
      });

      it('does not mark 90% stable once the reports stop', async function () {
        this.timeout(60_000);

        for (const until of [1, 3]) {
          const heard = await listen({detector, bpm: 150, seconds: 40, share: () => 0.9, report: t => (t < until ? t : undefined)});

          expect(heard.stable, `reports stopped at ${until} s`).to.deep.equal([]);
        }
      });

      for (const garbage of [Number.NaN, Number.POSITIVE_INFINITY, 1e300]) {
        it(`does not mark 90% stable after a report of ${garbage}`, async function () {
          this.timeout(60_000);
          const heard = await listen({detector, bpm: 150, seconds: 30, share: () => 0.9, report: t => (t < 0.2 ? garbage : t)});

          expect(heard.stable).to.deep.equal([]);
        });
      }
    });
  }

  it('peaks: starts over for a lock that went out before the loss showed, and relocks', async function () {
    this.timeout(60_000);
    // The clock takes a window or two to see it, and peaks locks at about 6 s
    const heard = await listen({detector: 'peaks', bpm: 150, seconds: 30, share: lossBetween(4, 9, 0.85)});

    expect(heard.stable[0].at).to.be.lessThan(heard.resets[0]);
    expect(heard.resets.length).to.equal(1);
    expect(heard.stable.at(-1)!.at).to.be.greaterThan(heard.resets[0]);
    expect(heard.stable.at(-1)!.tempo).to.be.closeTo(150, 1);
  });

  it('tempogram: starts over for a lock it held back, even when less was lost than the floor, and relocks', async function () {
    this.timeout(60_000);
    // 0.2 s lost at 9.5 s, under the 0.3 s floor, but the clock is still behind when the 11.5 s lock comes. Without the
    // start-over the tempogram, which reports stable only once, would never be marked stable.
    const heard = await listen({bpm: 150, seconds: 45, share: lossBetween(9.5, 10, 0.6)});

    expect(heard.resets.length).to.equal(1);
    expect(heard.resets[0]).to.be.greaterThan(10);
    expect(heard.stable.length).to.be.greaterThan(0);
    expect(heard.stable[0].at).to.be.greaterThan(heard.resets[0]);
    expect(heard.stable[0].tempo).to.be.closeTo(150, 1);
  });

  it('continuous analysis: a reset it makes itself forgets the loss too', async function () {
    this.timeout(60_000);
    const processor = new RealTimeBpmProcessor({numberOfInputs: 1, numberOfOutputs: 1, processorOptions: {continuousAnalysis: true, stabilizationTime: 2000}});
    const audio = groove(150, 16);
    const types: string[] = [];

    let startedOver = 0;

    processor.port.postMessage = (message: any) => types.push(message.type);

    // 85% for 5 s and then on time: the analyzer's own resets go by every 2 s, and the last of them outlives the loss.
    for (let i = 0, t = 0; i * quantum + quantum < audio.length; i += 1) {
      t += quantum / sampleRate / (t < 5 ? 0.85 : 1);

      if (i % 94 === 0) {
        processor.onMessage({data: {type: 'delivered', seconds: t}});
      }

      if (i === 0) {
        const clock = processor.sampleClock;
        const take = clock.takeStartOver;

        clock.takeStartOver = () => {
          const yes = take();

          startedOver += yes ? 1 : 0;

          return yes;
        };
      }

      processor.process([[audio.subarray(i * quantum, (i * quantum) + quantum)]], [[]], {});

      for (let j = 0; processor.analysisInProgress && j < 100_000; j += 1) {
        await Promise.resolve();
      }
    }

    expect(types.filter(type => type === 'analyzerReset').length).to.be.greaterThan(2);
    expect(startedOver).to.equal(0);
  });

  describe('silence that fills the buffer', () => {
    it('hands the analysis a copy: the quantum that follows would overwrite what it is reading', () => {
      const processor = new RealTimeBpmProcessor({numberOfInputs: 1, numberOfOutputs: 1, processorOptions: {}});
      const handed: Array<{data: Float32Array; asHanded: Float32Array}> = [];

      let quanta = 0;

      // Silence before every other quantum, so that it is silence that fills the buffer, as a fake clock can arrange
      processor.sampleClock = {
        advance: () => (quanta++ > 0),
        takeStartOver: () => false,
        offerLock: () => true,
        forget: () => undefined,
      };
      processor.realTimeBpmAnalyzer.analyzeChunk = async ({channelData}: {channelData: Float32Array}) => {
        handed.push({data: channelData, asHanded: channelData.slice()});
      };

      const quantaInBuffer = 4096 / quantum;

      for (let i = 0; i < quantaInBuffer * 2; i += 1) {
        processor.analysisInProgress = false;
        // Each one its own, as an overwrite with the same values would go unseen
        processor.process([[new Float32Array(quantum).fill(i + 1)]], [[]], {});
      }

      const fromSilence = handed.filter(({asHanded}) => asHanded.at(-1) === 0);

      expect(fromSilence.length).to.be.greaterThan(0);

      for (const {data, asHanded} of fromSilence) {
        expect(data).to.deep.equal(asHanded);
      }
    });
  });
});
