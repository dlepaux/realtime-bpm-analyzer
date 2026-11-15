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
});
