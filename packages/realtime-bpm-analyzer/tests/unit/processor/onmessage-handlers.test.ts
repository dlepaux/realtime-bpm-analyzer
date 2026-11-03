import {expect} from 'chai';
import {PROTOCOL_VERSION} from '../../../src/contract/types';
import {host, loadProcessorModule, processorOptions} from './worklet-stub';

/** What the processor does with each host message, and with a main thread it cannot talk to */
describe('RealTimeBpmProcessor - host messages', () => {
  let RealTimeBpmProcessor: any;

  before(async () => {
    RealTimeBpmProcessor = (await loadProcessorModule(44_100)).RealTimeBpmProcessor;
  });

  const makeProcessor = (options: unknown = processorOptions()) =>
    new RealTimeBpmProcessor({numberOfInputs: 1, numberOfOutputs: 1, processorOptions: options});

  it('says it is ready, in epoch 0 and in its protocol', () => {
    expect(makeProcessor().posted).to.deep.equal([{type: 'ready', protocol: PROTOCOL_VERSION, epoch: 0, at: 0}]);
  });

  it('stamps every message with the worklet clock at the time it is sent, for the epoch watchdog', () => {
    const processor = makeProcessor();
    (globalThis as any).currentTime = 2.5;
    try {
      processor.onMessage(host({type: 'reset', epoch: 1}));
    } finally {
      (globalThis as any).currentTime = 0;
    }

    expect(processor.posted.at(-1)).to.deep.equal({type: 'ready', protocol: PROTOCOL_VERSION, epoch: 1, at: 2.5});
  });

  it('ignores the live input clock of an analyzer made without liveInput', () => {
    const processor = makeProcessor();
    processor.onMessage(host({type: 'delivered', seconds: 1}));

    expect(processor.sampleClock).to.equal(null);
    expect(processor.stopped).to.equal(false);

    const live = makeProcessor(processorOptions(undefined, false, true));
    live.onMessage(host({type: 'delivered', seconds: 1}));
    expect(live.sampleClock).to.not.equal(null);
  });

  it('refuses options of another protocol with a fatal fault, and never processes', () => {
    const processor = makeProcessor({...processorOptions(), protocol: 0});

    expect(processor.posted).to.have.length(1);
    expect(processor.posted[0]).to.deep.include({type: 'fault', fatal: true});
    expect(processor.posted[0].error.name).to.equal('ProtocolError');
    expect(processor.process([[new Float32Array(128)]], [], {})).to.equal(false);
  });

  it('adopts the epoch of a reset, starts over and says ready in it', () => {
    const processor = makeProcessor();
    let adopted: number | undefined;
    const {adopt} = processor.session;
    processor.session = {...processor.session, adopt(epoch: number) {
      adopted = epoch;
      return adopt(epoch);
    }};

    processor.onMessage(host({type: 'reset', epoch: 1}));

    expect(adopted).to.equal(1);
    expect(processor.posted.at(-1)).to.deep.equal({type: 'ready', protocol: PROTOCOL_VERSION, epoch: 1, at: 0});
  });

  it('fails on a reset that does not move the epoch forward', () => {
    const processor = makeProcessor();
    processor.onMessage(host({type: 'reset', epoch: 1}));
    processor.onMessage(host({type: 'reset', epoch: 1}));

    expect(processor.posted.at(-1)).to.deep.include({type: 'fault', fatal: true, epoch: 1});
    expect(processor.stopped).to.equal(true);
  });

  it('fails on a host message of another protocol', () => {
    const processor = makeProcessor();
    processor.onMessage({data: {type: 'reset', epoch: 1}});

    expect(processor.posted.at(-1)).to.deep.include({type: 'fault', fatal: true});
    expect(processor.posted.at(-1).error.name).to.equal('ProtocolError');
  });

  it('stops on stop: process() returns false, so the browser may drop it, and analyses nothing more', () => {
    const processor = makeProcessor();
    let analyzed = false;
    processor.session = {...processor.session, async analyze() {
      analyzed = true;
      return [];
    }};
    processor.aggregate = () => ({isBufferFull: true, buffer: new Float32Array(4096), bufferSize: 4096});

    processor.onMessage(host({type: 'stop'}));

    expect(processor.stopped).to.equal(true);
    expect(processor.process([[new Float32Array(128)]], [], {})).to.equal(false);
    expect(analyzed).to.equal(false);
  });

  it('hands the session the context time the full buffer ends at, read before the analysis awaits', () => {
    const processor = makeProcessor();
    const seen: unknown[] = [];
    processor.session = {...processor.session, async analyze(...args: unknown[]) {
      seen.push(args[3]);
      return [];
    }};
    processor.aggregate = () => ({isBufferFull: true, buffer: new Float32Array(4096), bufferSize: 4096});

    (globalThis as any).currentTime = 3;
    try {
      processor.process([[new Float32Array(128)]], [], {});
    } finally {
      (globalThis as any).currentTime = 0;
    }

    // The quantum starts at currentTime, and the buffer's last sample is the quantum's last
    expect(seen).to.deep.equal([3 + (128 / 44_100)]);
  });

  it('turns a throw while rendering into a fatal ProcessorError', () => {
    const processor = makeProcessor();
    processor.aggregate = () => {
      throw new Error('broken');
    };

    expect(processor.process([[new Float32Array(128)]], [], {})).to.equal(false);
    expect(processor.posted.at(-1)).to.deep.include({type: 'fault', fatal: true});
    expect(processor.posted.at(-1).error).to.deep.equal({name: 'ProcessorError', message: 'broken'});
  });

  it('ignores unknown message types, so a newer main thread cannot crash it, and malformed ones', () => {
    const processor = makeProcessor();

    expect(() => {
      processor.onMessage(host({type: 'future-message-type'}));
      processor.onMessage({});
      processor.onMessage({data: null});
    }).to.not.throw();
    expect(processor.stopped).to.equal(false);
    expect(processor.posted).to.have.length(1);
  });
});
