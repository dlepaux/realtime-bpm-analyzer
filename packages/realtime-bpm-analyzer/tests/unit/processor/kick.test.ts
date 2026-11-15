import {expect} from 'chai';
import {PROTOCOL} from '../../../src/contract/types';
import type {PostedWorkletMessage} from '../../../src/contract/types';
import {createKickScene, scoreKicks} from '../../fixtures/kick-scenes';
import {host, loadProcessorModule, processorOptions} from './worklet-stub';

const quantum = 128;
const sampleRate = 48_000;

type KickMessage = Extract<PostedWorkletMessage, {type: 'kick'}>;

/** The processor reports each kick of its input as it hears it, on the context clock (RBA-243) */
describe('RealTimeBpmProcessor - kicks', () => {
  let RealTimeBpmProcessor: any;

  before(async () => {
    RealTimeBpmProcessor = (await loadProcessorModule(sampleRate)).RealTimeBpmProcessor;
  });

  /**
   * Renders samples quantum by quantum, with the worklet's clock starting at `contextStart`
   * @returns The processor and the kicks it posted
   */
  function play(samples: Float32Array, {contextStart = 0, processor = build(), onQuantum = (_index: number) => undefined} = {}) {
    const kicks = () => (processor.posted as PostedWorkletMessage[]).filter((message): message is KickMessage => message.type === 'kick');
    for (let index = 0; index * quantum < samples.length; index += 1) {
      (globalThis as any).currentTime = contextStart + ((index * quantum) / sampleRate);
      onQuantum(index);
      const chunk = new Float32Array(quantum);
      chunk.set(samples.subarray(index * quantum, (index + 1) * quantum));
      processor.process([[chunk]], [[]], {});
    }

    return {processor, kicks: kicks()};
  }

  function build(liveInput = false) {
    return new RealTimeBpmProcessor({numberOfInputs: 1, numberOfOutputs: 1, processorOptions: processorOptions(undefined, false, liveInput)});
  }

  afterEach(() => {
    (globalThis as any).currentTime = 0;
  });

  it('posts each kick at once, stamped on the context clock where the kick started', () => {
    const scene = createKickScene('kicks-alone');
    const {kicks} = play(scene.samples, {contextStart: 3});

    const score = scoreKicks(scene.kicks.map(time => time + 3), kicks.map(({contextTime}) => contextTime), 0.05);
    expect(score.hits).to.equal(scene.kicks.length);
    expect(score.falseKicks).to.equal(0);
    score.errors.forEach(error => {
      expect(Math.abs(error)).to.be.below(0.008);
    });
    kicks.forEach(kick => {
      expect(kick).to.have.all.keys('type', 'protocol', 'epoch', 'contextTime', 'strength', 'at');
      expect(kick.protocol).to.deep.equal(PROTOCOL);
      expect(kick.epoch).to.equal(0);
      // Posted in the quantum that confirmed it: within 30 ms of where it started, never before
      expect(kick.at).to.be.within(kick.contextTime, kick.contextTime + 0.03);
    });
  });

  it('stamps kicks with the epoch of the last reset, and starts over to hear them', () => {
    const scene = createKickScene('kicks-alone');
    const processor = build();
    const resetAt = Math.round(8 * sampleRate / quantum);
    const {kicks} = play(scene.samples, {processor, onQuantum(index) {
      if (index === resetAt) {
        processor.onMessage(host({type: 'reset', epoch: 1}));
      }
    }});

    const resetTime = (resetAt * quantum) / sampleRate;
    expect(kicks.filter(({contextTime}) => contextTime < resetTime).every(({epoch}) => epoch === 0)).to.equal(true);
    expect(kicks.filter(({at}) => at >= resetTime).every(({epoch}) => epoch === 1)).to.equal(true);
    // The detector starts over at the reset, and hears every kick from 80 ms after it on
    const truthAfter = scene.kicks.filter(time => time > resetTime + 0.08);
    const heardAfter = kicks.filter(({epoch}) => epoch === 1);
    expect(scoreKicks(truthAfter, heardAfter.map(({contextTime}) => contextTime), 0.05).misses).to.equal(0);
  });

  it('posts no kick once stopped', () => {
    const scene = createKickScene('kicks-alone');
    const processor = build();
    processor.onMessage(host({type: 'stop'}));
    expect(play(scene.samples, {processor}).kicks).to.deep.equal([]);
  });

  it('hears kicks from a live input too, and none in the silence it owes for lost audio', () => {
    const scene = createKickScene('kicks-alone');
    const processor = build(true);
    // The input reports a clock that runs on, so the processor owes silence now and then: none of it may count
    const {kicks} = play(scene.samples, {processor, onQuantum(index) {
      if (index % 94 === 0) {
        processor.onMessage(host({type: 'delivered', seconds: (index * quantum * 1.01) / sampleRate}));
      }
    }});

    const score = scoreKicks(scene.kicks, kicks.map(({contextTime}) => contextTime), 0.05);
    expect(score.misses).to.equal(0);
    expect(score.falseKicks).to.equal(0);
  });

  /** Counts the detector's resets, quantum by quantum */
  function countResets(processor: any) {
    const resets: number[] = [];
    const reset = processor.kickDetector.reset;
    let quanta = 0;
    processor.kickDetector.reset = () => {
      resets.push(quanta);
      reset();
    };

    return {resets, tick() {
      quanta += 1;
    }};
  }

  it('starts the kicks over when the live input restarts for lost audio', () => {
    const processor = build(true);
    const {resets, tick} = countResets(processor);
    let quanta = 0;
    // A clock that has lost audio at the 10th quantum, and only then
    processor.sampleClock = {
      advance: () => false,
      takeStartOver: () => quanta++ === 10,
      isLosing: () => false,
      offerLock: () => true,
      forget: () => undefined,
    };
    for (let index = 0; index < 20; index += 1) {
      processor.process([[new Float32Array(quantum)]], [[]], {});
      tick();
    }

    expect(resets).to.deep.equal([10]);
  });

  it('starts the kicks over when the input comes back after a gap, and hears the kicks after it', () => {
    const scene = createKickScene('kicks-alone');
    const processor = build();
    const {resets, tick} = countResets(processor);
    // The input goes away for a second at 4 s, as a source that ended and another that took its place
    const gapFrom = Math.round(4 * sampleRate / quantum);
    const gapTo = gapFrom + Math.round(sampleRate / quantum);
    for (let index = 0; index * quantum < scene.samples.length; index += 1) {
      (globalThis as any).currentTime = (index * quantum) / sampleRate;
      const chunk = new Float32Array(quantum);
      chunk.set(scene.samples.subarray(index * quantum, (index + 1) * quantum));
      processor.process(index >= gapFrom && index < gapTo ? [[]] : [[chunk]], [[]], {});
      tick();
    }

    expect(resets).to.deep.equal([gapTo]);
    const kicks = (processor.posted as PostedWorkletMessage[]).filter((message): message is KickMessage => message.type === 'kick');
    const gapStart = (gapFrom * quantum) / sampleRate;
    const gapEnd = (gapTo * quantum) / sampleRate;
    const truth = scene.kicks.filter(time => time < gapStart - 0.03 || time > gapEnd + 0.08);
    const score = scoreKicks(truth, kicks.map(({contextTime}) => contextTime), 0.05);
    expect(score.misses).to.equal(0);
    expect(score.falseKicks).to.equal(0);
  });
});
