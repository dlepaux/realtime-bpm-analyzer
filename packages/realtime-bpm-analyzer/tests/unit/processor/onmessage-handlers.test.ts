import {expect} from 'chai';
import {PROTOCOL} from '../../../src/contract/types';
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
    expect(makeProcessor().posted).to.deep.equal([{type: 'ready', protocol: PROTOCOL, epoch: 0, at: 0}]);
  });

  it('stamps every message with the worklet clock at the time it is sent, for the epoch watchdog', () => {
    const processor = makeProcessor();
    (globalThis as any).currentTime = 2.5;
    try {
      processor.onMessage(host({type: 'reset', epoch: 1}));
    } finally {
      (globalThis as any).currentTime = 0;
    }

    expect(processor.posted.at(-1)).to.deep.equal({type: 'ready', protocol: PROTOCOL, epoch: 1, at: 2.5});
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

  it('refuses options of another protocol major, or a bare number, with a fatal fault, and never processes', () => {
    for (const protocol of [{major: PROTOCOL.major + 1, minor: PROTOCOL.minor}, 1, undefined]) {
      const processor = makeProcessor({...processorOptions(), protocol});

      expect(processor.posted, JSON.stringify(protocol)).to.have.length(1);
      expect(processor.posted[0]).to.deep.include({type: 'fault', fatal: true});
      expect(processor.posted[0].error.name).to.equal('ProtocolError');
      expect(processor.process([[new Float32Array(128)]], [], {})).to.equal(false);
    }
  });

  it('starts for an analyzer of another minor, older or newer, and says ready in its own', () => {
    for (const minor of [PROTOCOL.minor + 1, PROTOCOL.minor + 3]) {
      const processor = makeProcessor({...processorOptions(), protocol: {major: PROTOCOL.major, minor}});
      expect(processor.posted).to.deep.equal([{type: 'ready', protocol: PROTOCOL, epoch: 0, at: 0}]);
    }
  });

  it('keeps the main thread\'s minor, older or newer, where a later minor maps what it emits (ProtocolVersion)', () => {
    for (const minor of [PROTOCOL.minor, PROTOCOL.minor + 1, PROTOCOL.minor + 3]) {
      const processor = makeProcessor({...processorOptions(), protocol: {major: PROTOCOL.major, minor}});
      expect(processor.hostProtocol).to.deep.equal({major: PROTOCOL.major, minor});
    }
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
    expect(processor.posted.at(-1)).to.deep.equal({type: 'ready', protocol: PROTOCOL, epoch: 1, at: 0});
  });

  it('fails on a reset that does not move the epoch forward', () => {
    const processor = makeProcessor();
    processor.onMessage(host({type: 'reset', epoch: 1}));
    processor.onMessage(host({type: 'reset', epoch: 1}));

    expect(processor.posted.at(-1)).to.deep.include({type: 'fault', fatal: true, epoch: 1});
    expect(processor.stopped).to.equal(true);
  });

  const expectFailed = (processor: any, label: string) => {
    expect(processor.posted.at(-1), label).to.deep.include({type: 'fault', fatal: true});
    expect(processor.posted.at(-1).error.name, label).to.equal('ProtocolError');
    expect(processor.stopped, label).to.equal(true);
  };

  it('fails on a host message of another major, or of no protocol, whatever its type', () => {
    const otherMajor = {major: PROTOCOL.major + 1, minor: PROTOCOL.minor + 1};
    for (const data of [{type: 'reset', epoch: 1}, {type: 'reset', epoch: 1, protocol: otherMajor}, {type: 'beat', protocol: otherMajor}]) {
      const processor = makeProcessor();
      processor.onMessage({data});
      expectFailed(processor, JSON.stringify(data));
    }
  });

  it('fails on a live input clock that is not a finite number, as on a malformed reset', () => {
    for (const seconds of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '1', undefined]) {
      const processor = makeProcessor(processorOptions(undefined, false, true));
      processor.onMessage(host({type: 'delivered', seconds}));
      expectFailed(processor, String(seconds));
      expect(processor.sampleClock, String(seconds)).to.equal(null);
    }
  });

  it('takes a known host message from a later minor', () => {
    const processor = makeProcessor();
    processor.onMessage({data: {type: 'reset', epoch: 1, protocol: {major: PROTOCOL.major, minor: PROTOCOL.minor + 1}}});

    expect(processor.posted.at(-1)).to.deep.include({type: 'ready', epoch: 1});
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

  it('ignores a host message type it does not know from a later minor, which may have added it', () => {
    const processor = makeProcessor();
    processor.onMessage({data: {type: 'future-message-type', protocol: {major: PROTOCOL.major, minor: PROTOCOL.minor + 1}}});

    expect(processor.stopped).to.equal(false);
    expect(processor.posted).to.have.length(1);
  });

  it('fails on a host message type it does not know from its own minor: a bug or a typo', () => {
    for (const type of ['future-message-type', 'rest']) {
      const processor = makeProcessor();
      processor.onMessage(host({type, epoch: 1}));
      expectFailed(processor, type);
    }
  });

  it('ignores port events that carry no message at all', () => {
    const processor = makeProcessor();

    expect(() => {
      processor.onMessage({});
      processor.onMessage({data: null});
    }).to.not.throw();
    expect(processor.stopped).to.equal(false);
    expect(processor.posted).to.have.length(1);
  });
});
