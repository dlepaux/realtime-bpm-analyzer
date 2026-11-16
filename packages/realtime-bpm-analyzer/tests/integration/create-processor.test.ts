import {expect} from 'chai';
import {createRealtimeBpmAnalyzer, analyzeFullBuffer, getBiquadFilter, BpmAnalyzer} from '../../src/index';
import type {LowpassOption} from '../../src/index';
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
      const tempogram = await createRealtimeBpmAnalyzer(audioContext, {engine: {name: 'tempogram', mode: 'measured'}});
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
        [{engine: {name: 'peaks', lowpass: {frequency: 150}}}, TypeError],
        [{engine: {name: 'tempogram', restartAfterSeconds: 30}}, TypeError],
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
        // Realtime peaks' lowpass is fixed: the message must not send the caller to a realtime engine.lowpass
        [{frequencyValue: 200}, 'analyzer.input'],
        [{qualityValue: 1}, 'analyzer.input'],
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

    it('rejects any option it does not take, and a tempo range with a key other than min and max, naming the key', async () => {
      // RBA-108's DECISION of 2026-11-16: a typo would otherwise run the defaults without a word
      const refused: Array<[Record<string, unknown>, string]> = [
        [{engin: 'peaks'}, 'engin'],
        [{tempRange: {min: 60, max: 120}}, 'tempRange'],
        [{tempoRange: {min: 60, max: 120, mni: 50}}, 'mni'],
        [{engine: 'tempogram', lowpass: undefined}, 'lowpass'],
      ];
      for (const [options, key] of refused) {
        const pending = createRealtimeBpmAnalyzer(audioContext, options as Parameters<typeof createRealtimeBpmAnalyzer>[1]);
        let caught: unknown;
        try {
          await pending;
        } catch (error) {
          caught = error;
        }

        expect(caught, JSON.stringify(options)).to.be.instanceOf(TypeError);
        expect((caught as Error).message).to.contain(` ${key}`);
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
        frequency: 200,
        q: 1,
      });
      expect(lowpass).to.be.instanceOf(BiquadFilterNode);
    });

    it('should use custom frequency value', () => {
      const lowpass = getBiquadFilter(audioContext, {
        frequency: 150,
      });
      expect(lowpass.frequency.value).to.equal(150);
    });

    it('should use custom quality value', () => {
      const lowpass = getBiquadFilter(audioContext, {
        q: 2,
      });
      expect(lowpass.Q.value).to.equal(2);
    });

    it('should use both custom frequency and quality values', () => {
      const lowpass = getBiquadFilter(audioContext, {
        frequency: 180,
        q: 1.5,
      });
      expect(lowpass.frequency.value).to.equal(180);
      expect(lowpass.Q.value).to.equal(1.5);
    });

    it('refuses the 5.x names with a TypeError that names the v6 one', () => {
      // @ts-expect-error The 5.x name, on purpose
      expect(() => getBiquadFilter(audioContext, {frequencyValue: 150})).to.throw(TypeError, 'use frequency');
      // @ts-expect-error The 5.x name, on purpose
      expect(() => getBiquadFilter(audioContext, {qualityValue: 2})).to.throw(TypeError, 'use q');
    });

    it('refuses the DOM\'s fields, which share frequency with LowpassOption and type-check as one', () => {
      const refused: Array<[BiquadFilterOptions, RegExp]> = [
        [{frequency: 150, Q: 4}, /Q is the DOM's spelling: use q/],
        [{frequency: 150, detune: 100}, /detune is the DOM's, and has no equivalent here: fold it into frequency/],
        [{frequency: 150, type: 'highpass'}, /type is the DOM's: this filter is always a lowpass/],
        [{frequency: 150, gain: 6}, /gain is the DOM's: a lowpass has no gain/],
        // The key's presence is the error, so the call can't pass on one value and throw on another
        [{frequency: 150, type: undefined}, /type is the DOM's: this filter is always a lowpass/],
      ];
      for (const [domOptions, message] of refused) {
        expect(() => getBiquadFilter(audioContext, domOptions), Object.keys(domOptions).join()).to.throw(TypeError, message);
      }
    });

    it('refuses an unknown key, such as a typo that would otherwise fall back to the default', () => {
      const typo = {frequency: 150, frequncy: 300};
      expect(() => getBiquadFilter(audioContext, typo)).to.throw(TypeError, /frequncy is unknown: the settings are frequency and q/);
    });

    it('refuses a setting that is not a finite number', () => {
      expect(() => getBiquadFilter(audioContext, {frequency: Number.NaN})).to.throw(RangeError, /frequency NaN/);
      expect(() => getBiquadFilter(audioContext, {q: Number.POSITIVE_INFINITY})).to.throw(RangeError, /q Infinity/);
    });

    it('refuses settings that are not an object, naming their type and not their value', () => {
      const notObjects: Array<[unknown, string]> = [[150, 'a number'], ['150', 'a string'], [true, 'a boolean'], [[150, 1], 'an array'], [() => 150, 'a function']];
      for (const [settings, kind] of notObjects) {
        expect(() => getBiquadFilter(audioContext, settings as LowpassOption), kind)
          .to.throw(TypeError, `The lowpass settings are an object with frequency and q, not ${kind}.`);
      }
    });

    it('refuses a setting that is not a number, naming its type', () => {
      const asString = {frequency: '150'} as unknown as LowpassOption;
      expect(() => getBiquadFilter(audioContext, asString)).to.throw(TypeError, 'The lowpass setting frequency is a string: it must be a finite number.');
    });

    it('refuses a frequency that is not above 0 and below half the context\'s rate, which 5.x clamped silently', () => {
      const {sampleRate} = audioContext;
      for (const frequency of [0, -1, sampleRate / 2, sampleRate]) {
        expect(() => getBiquadFilter(audioContext, {frequency}), String(frequency)).to.throw(
          RangeError,
          `The lowpass setting frequency ${frequency} is out of range: at a sample rate of ${sampleRate} Hz, it must be above 0 and below ${sampleRate / 2} Hz.`,
        );
      }
    });

    it('refuses a frequency that the AudioParam\'s 32-bit float would round onto Nyquist or 0', () => {
      const {sampleRate} = audioContext;
      for (const frequency of [(sampleRate / 2) - 0.0005, 1e-50]) {
        expect(() => getBiquadFilter(audioContext, {frequency}), String(frequency)).to.throw(RangeError, 'as the 32-bit float Web Audio stores) is out of range');
      }
    });

    it('refuses a q outside -758 to 770 dB, where Web Audio\'s 32-bit resonance term stops being a normal finite float', () => {
      for (const q of [-759, 771, -800, -Number.MAX_VALUE, Number.MAX_VALUE]) {
        expect(() => getBiquadFilter(audioContext, {q}), String(q)).to.throw(
          RangeError,
          `The lowpass setting q ${q} is out of range: it must be from -758 to 770 dB.`,
        );
      }
    });

    it('accepts a q at both ends of its range, 0 and the default', () => {
      for (const q of [-758, 770, 0]) {
        expect(getBiquadFilter(audioContext, {q}).Q.value, String(q)).to.equal(q);
      }

      expect(getBiquadFilter(audioContext).Q.value).to.equal(1);
    });

    it('accepts a frequency just inside both ends', () => {
      // 0.01 Hz under Nyquist survives the AudioParam's 32-bit float, whose step there is about 0.002 Hz
      for (const frequency of [0.001, (audioContext.sampleRate / 2) - 0.01]) {
        expect(getBiquadFilter(audioContext, {frequency}).frequency.value).to.be.closeTo(frequency, 0.005);
      }
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
