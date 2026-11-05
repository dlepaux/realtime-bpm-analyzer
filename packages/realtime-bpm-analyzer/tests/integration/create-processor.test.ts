import {expect} from 'chai';
import {createRealtimeBpmAnalyzer, analyzeFullBuffer, getBiquadFilter, BpmAnalyzer} from '../../src/index';
import {createTestAudioContext, closeAudioContext} from '../setup';

/**
 * Integration tests for createRealtimeBpmAnalyzer function
 */
describe('createRealtimeBpmAnalyzer', function () {
  // AudioWorklet loading takes time, set higher timeout
  this.timeout(5000);

  let audioContext: AudioContext;

  beforeEach(() => {
    audioContext = createTestAudioContext();
  });

  afterEach(async () => {
    await closeAudioContext(audioContext);
  });

  describe('initialization', () => {
    it('should return a BpmAnalyzer instance', async () => {
      const processor = await createRealtimeBpmAnalyzer(audioContext);
      expect(processor).to.be.instanceOf(BpmAnalyzer);
    });

    it('should return an instance that extends EventTarget', async () => {
      const processor = await createRealtimeBpmAnalyzer(audioContext);
      expect(processor).to.be.instanceOf(EventTarget);
    });

    it('should create an AudioWorkletNode internally', async () => {
      const processor = await createRealtimeBpmAnalyzer(audioContext);
      expect(processor.node).to.be.instanceOf(AudioWorkletNode);
    });

    it('should accept engine options', async () => {
      const peaks = await createRealtimeBpmAnalyzer(audioContext, {engine: {name: 'peaks', restartAfterSeconds: 10}, debug: false});
      const tempogram = await createRealtimeBpmAnalyzer(audioContext, {engine: {name: 'tempogram', mode: 'extension'}});
      expect(peaks).to.be.instanceOf(BpmAnalyzer);
      expect(tempogram).to.be.instanceOf(BpmAnalyzer);
    });

    it('resolves once the processor is ready, listening with reason started', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);
      expect(analyzer.state).to.deep.equal({status: 'listening', epoch: 0, progress: 0, reason: 'started'});
      analyzer.stop();
      expect(analyzer.state).to.deep.equal({status: 'stopped', epoch: 0, error: null});
    });

    it('refuses an invalid engine or debug on the main thread', async () => {
      const invalid: Array<[unknown, typeof RangeError | typeof TypeError]> = [
        [{engine: 'magic'}, RangeError],
        [{engine: {name: 'peaks', restartAfterSeconds: -1}}, RangeError],
        [{debug: 'yes'}, TypeError],
      ];
      for (const [options, expected] of invalid) {
        let caught: unknown;
        try {
          await createRealtimeBpmAnalyzer(audioContext, options as Parameters<typeof createRealtimeBpmAnalyzer>[1]);
        } catch (error) {
          caught = error;
        }

        expect(caught, JSON.stringify(options)).to.be.instanceOf(expected);
      }
    });

    it('refuses each 5.x option name with a TypeError that names its v6 replacement', async () => {
      const removed: Array<[Record<string, unknown>, string]> = [
        [{detector: 'tempogram'}, 'engine'],
        [{continuousAnalysis: true}, 'restartAfterSeconds'],
        [{stabilizationTime: 20_000}, 'restartAfterSeconds'],
        [{muteTimeInIndexes: 10_000}, 'no replacement'],
        [{tempogramMode: 'extension'}, 'mode'],
        [{frequencyValue: 200}, 'lowpass'],
        [{qualityValue: 1}, 'lowpass'],
      ];
      for (const [options, replacement] of removed) {
        let caught: unknown;
        try {
          await createRealtimeBpmAnalyzer(audioContext, options as Parameters<typeof createRealtimeBpmAnalyzer>[1]);
        } catch (error) {
          caught = error;
        }

        expect(caught, JSON.stringify(options)).to.be.instanceOf(TypeError);
        expect((caught as Error).message).to.contain(Object.keys(options)[0]).and.to.contain(replacement);
      }
    });

    it('should accept a tempo range', async () => {
      const processor = await createRealtimeBpmAnalyzer(audioContext, {
        tempoRange: {min: 70, max: 140},
      });
      expect(processor).to.be.instanceOf(BpmAnalyzer);
    });

    it('gives peaks a lowpass in front of the worklet, and the tempogram nothing', async () => {
      const peaks = await createRealtimeBpmAnalyzer(audioContext, {engine: 'peaks'});
      const tempogram = await createRealtimeBpmAnalyzer(audioContext);

      expect(peaks.input).to.be.instanceOf(BiquadFilterNode);
      expect((peaks.input as BiquadFilterNode).type).to.equal('lowpass');
      expect(peaks.input).to.equal(peaks.input);
      expect(tempogram.input).to.equal(tempogram.node);
    });

    it('builds the lowpass only when asked, and wires it to the worklet', async () => {
      const connections: AudioNode[] = [];
      const {connect} = BiquadFilterNode.prototype;
      let built = 0;
      const {createBiquadFilter} = audioContext;

      audioContext.createBiquadFilter = function (this: BaseAudioContext) {
        built += 1;

        return createBiquadFilter.call(this);
      };

      BiquadFilterNode.prototype.connect = function (this: BiquadFilterNode, destination: AudioNode) {
        connections.push(destination);

        return connect.call(this, destination as never) as unknown as AudioNode;
      } as typeof connect;

      try {
        const analyzer = await createRealtimeBpmAnalyzer(audioContext, {engine: 'peaks'});

        expect(built).to.equal(0);
        expect(analyzer.input).to.be.instanceOf(BiquadFilterNode);
        expect(built).to.equal(1);
        expect(connections).to.deep.equal([analyzer.node]);
      } finally {
        BiquadFilterNode.prototype.connect = connect;
      }
    });

    it('should reject an invalid tempo range on the main thread', async () => {
      let caught: unknown;
      try {
        await createRealtimeBpmAnalyzer(audioContext, {tempoRange: {min: 100, max: 150}});
      } catch (err) {
        caught = err;
      }

      expect(caught).to.be.instanceOf(RangeError);
      expect((caught as Error).message).to.contain('tempoRange');
    });
  });

  describe('error wrapping', () => {
    it('wraps addModule rejection with library context and preserves cause', async () => {
      const originalAddModule = audioContext.audioWorklet.addModule.bind(audioContext.audioWorklet);
      const underlying = new Error('boom');
      audioContext.audioWorklet.addModule = async () => {
        throw underlying;
      };

      let caught: unknown;
      try {
        await createRealtimeBpmAnalyzer(audioContext);
      } catch (err) {
        caught = err;
      } finally {
        audioContext.audioWorklet.addModule = originalAddModule;
      }

      expect(caught).to.be.instanceOf(Error);
      expect((caught as Error).message).to.contain('Failed to load realtime-bpm-analyzer worklet');
      expect((caught as Error).message).to.contain('boom');
      expect((caught as Error).cause).to.equal(underlying);
    });
  });

  describe('worklet loading', () => {
    // Served by the test runner from the build output CI produces before `npm test`
    const publishedProcessorPath = '/dist/realtime-bpm-processor.js';

    type AddModuleCall = {url: string; ms: number};

    /**
     * Records every addModule call with its duration, so the tests can assert which URL was loaded
     * and report how long each loading path takes.
     */
    function spyOnAddModule(ctx: AudioContext): {calls: AddModuleCall[]; restore: () => void} {
      const worklet = ctx.audioWorklet;
      const original = worklet.addModule.bind(worklet);
      const calls: AddModuleCall[] = [];
      worklet.addModule = async (url: string | URL, options?: WorkletOptions) => {
        const start = performance.now();
        await original(url, options);
        calls.push({url: String(url), ms: performance.now() - start});
      };

      return {
        calls,
        restore() {
          worklet.addModule = original;
        },
      };
    }

    /**
     * Swaps URL.revokeObjectURL for a recorder during one call.
     */
    async function recordRevokes(run: () => Promise<unknown>): Promise<string[]> {
      const original = URL.revokeObjectURL.bind(URL);
      const revoked: string[] = [];
      URL.revokeObjectURL = (url: string) => {
        revoked.push(url);
        original(url);
      };

      try {
        await run();
      } finally {
        URL.revokeObjectURL = original;
      }

      return revoked;
    }

    async function rejectionOf(run: () => Promise<unknown>): Promise<unknown> {
      try {
        await run();
      } catch (err) {
        return err;
      }

      throw new Error('expected a rejection');
    }

    it('loads the inlined processor from a blob: URL by default, then revokes it', async () => {
      const spy = spyOnAddModule(audioContext);
      let analyzer: BpmAnalyzer | undefined;
      const revoked = await recordRevokes(async () => {
        analyzer = await createRealtimeBpmAnalyzer(audioContext);
      }).finally(spy.restore);

      expect(analyzer!.node).to.be.instanceOf(AudioWorkletNode);
      expect(spy.calls).to.have.length(1);
      expect(spy.calls[0].url).to.match(/^blob:/);
      expect(revoked).to.deep.equal([spy.calls[0].url]);
      console.log(`[timing] addModule(blob:) ${spy.calls[0].ms.toFixed(1)} ms`);
    });

    it('loads the published processor from processorUrl and leaves the URL alone', async () => {
      const spy = spyOnAddModule(audioContext);
      let analyzer: BpmAnalyzer | undefined;
      const revoked = await recordRevokes(async () => {
        analyzer = await createRealtimeBpmAnalyzer(audioContext, {processorUrl: publishedProcessorPath});
      }).finally(spy.restore);

      // The node constructor throws unless the loaded file registered the processor
      expect(analyzer!.node).to.be.instanceOf(AudioWorkletNode);
      expect(spy.calls.map(call => call.url)).to.deep.equal([publishedProcessorPath]);
      expect(revoked).to.deep.equal([]);
      console.log(`[timing] addModule(url) ${spy.calls[0].ms.toFixed(1)} ms`);
    });

    it('accepts a URL object and keeps it out of the worklet options', async () => {
      // A URL in processorOptions would make the AudioWorkletNode constructor fail structured cloning
      const processorUrl = new URL(publishedProcessorPath, location.href);
      const analyzer = await createRealtimeBpmAnalyzer(audioContext, {processorUrl, engine: 'tempogram'});

      expect(analyzer.node).to.be.instanceOf(AudioWorkletNode);
    });

    it('wraps a processorUrl that cannot be loaded', async () => {
      const caught = await rejectionOf(async () => createRealtimeBpmAnalyzer(audioContext, {
        processorUrl: '/dist/does-not-exist.js',
      }));

      expect(caught).to.be.instanceOf(Error);
      expect((caught as Error).message).to.contain('Failed to load realtime-bpm-analyzer worklet');
      expect((caught as Error).cause).to.exist;
    });

    for (const processorUrl of ['', '   ', 42, null]) {
      it(`rejects processorUrl ${JSON.stringify(processorUrl)} before loading anything`, async () => {
        const spy = spyOnAddModule(audioContext);
        const caught = await rejectionOf(async () => createRealtimeBpmAnalyzer(audioContext, {
          processorUrl: processorUrl as unknown as string,
        })).finally(spy.restore);

        expect(caught).to.be.instanceOf(TypeError);
        expect((caught as Error).message).to.contain('processorUrl');
        expect(spy.calls).to.have.length(0);
      });
    }

    for (const liveInput of [true, 'track', 42, null, {}, {kind: 'video'}]) {
      it(`rejects liveInput ${JSON.stringify(liveInput)} before loading anything`, async () => {
        const spy = spyOnAddModule(audioContext);
        const caught = await rejectionOf(async () => createRealtimeBpmAnalyzer(audioContext, {
          liveInput: liveInput as unknown as MediaStreamTrack,
        })).finally(spy.restore);

        expect(caught).to.be.instanceOf(TypeError);
        expect((caught as Error).message).to.contain('liveInput');
        expect(spy.calls).to.have.length(0);
      });
    }

    it('takes an audio track, and keeps it out of the worklet options', async () => {
      // A track in processorOptions would make the AudioWorkletNode constructor fail structured cloning
      const liveInput = audioContext.createMediaStreamDestination().stream.getAudioTracks()[0];
      const analyzer = await createRealtimeBpmAnalyzer(audioContext, {liveInput});

      expect(analyzer.node).to.be.instanceOf(AudioWorkletNode);
      analyzer.stop();
    });

    it('publishes a standalone processor file with no imports', async () => {
      const source = await (await fetch(publishedProcessorPath)).text();

      expect(source).to.contain('registerProcessor(');
      expect(source).to.not.match(/^\s*import[\s{*'"]/m);
      expect(source).to.not.match(/\bimport\s*\(/);
    });
  });

  describe('AudioNode capabilities', () => {
    it('should be connectable to audio destination', async () => {
      const processor = await createRealtimeBpmAnalyzer(audioContext);
      expect(() => {
        processor.connect(audioContext.destination);
      }).to.not.throw();
    });

    it('should be disconnectable', async () => {
      const processor = await createRealtimeBpmAnalyzer(audioContext);
      processor.connect(audioContext.destination);
      expect(() => {
        processor.disconnect();
      }).to.not.throw();
    });
  });
});

/**
 * Integration tests for getBiquadFilter function
 */
describe('getBiquadFilter', () => {
  let audioContext: AudioContext;

  beforeEach(() => {
    audioContext = createTestAudioContext();
  });

  afterEach(async () => {
    await closeAudioContext(audioContext);
  });

  describe('with default options', () => {
    it('should create a BiquadFilterNode', async function () {
      this.timeout(5000);
      const lowpass = getBiquadFilter(audioContext);
      expect(lowpass).to.be.instanceOf(BiquadFilterNode);
    });

    it('should create a lowpass filter', () => {
      const lowpass = getBiquadFilter(audioContext);
      expect(lowpass.type).to.equal('lowpass');
    });

    it('should use default frequency value (200Hz)', () => {
      const lowpass = getBiquadFilter(audioContext);
      expect(lowpass.frequency.value).to.equal(200);
    });

    it('should use default quality value (1)', () => {
      const lowpass = getBiquadFilter(audioContext);
      expect(lowpass.Q.value).to.equal(1);
    });
  });

  describe('with custom options', () => {
    it('should create a BiquadFilterNode with custom frequency', async function () {
      this.timeout(5000);
      const lowpass = getBiquadFilter(audioContext, {
        frequencyValue: 200,
        qualityValue: 1,
      });
      expect(lowpass).to.be.instanceOf(BiquadFilterNode);
    });

    it('should use custom frequency value', () => {
      const lowpass = getBiquadFilter(audioContext, {
        frequencyValue: 150,
      });
      expect(lowpass.frequency.value).to.equal(150);
    });

    it('should use custom quality value', () => {
      const lowpass = getBiquadFilter(audioContext, {
        qualityValue: 2,
      });
      expect(lowpass.Q.value).to.equal(2);
    });

    it('should use both custom frequency and quality values', () => {
      const lowpass = getBiquadFilter(audioContext, {
        frequencyValue: 180,
        qualityValue: 1.5,
      });
      expect(lowpass.frequency.value).to.equal(180);
      expect(lowpass.Q.value).to.equal(1.5);
    });
  });
});

/**
 * Basic smoke tests for exported functions
 */
describe('Public API exports', () => {
  it('should export analyzeFullBuffer function', () => {
    expect(typeof analyzeFullBuffer === 'function').to.be.equal(true);
  });

  it('should export getBiquadFilter function', () => {
    expect(typeof getBiquadFilter === 'function').to.be.equal(true);
  });

  it('should export createRealtimeBpmAnalyzer function', () => {
    expect(typeof createRealtimeBpmAnalyzer === 'function').to.be.equal(true);
  });

  it('exports none of the 5.x surface', async () => {
    const entry: Record<string, unknown> = await import('../../src/index');

    for (const removed of ['RealTimeBpmAnalyzer', 'createRealTimeBpmProcessor']) {
      expect(entry, removed).to.not.have.property(removed);
    }

    expect(Object.keys(entry).sort()).to.deep.equal(['BpmAnalyzer', 'RELATION_TOLERANCE', 'analyzeFullBuffer', 'createRealtimeBpmAnalyzer', 'getBiquadFilter']);
  });
});

/**
 * AudioContext compatibility tests
 */
describe('AudioContext compatibility', () => {
  it('should create a valid AudioContext instance', async () => {
    const audioContext = new AudioContext();
    expect(audioContext).to.be.instanceOf(AudioContext);
    await audioContext.close();
  });
});
