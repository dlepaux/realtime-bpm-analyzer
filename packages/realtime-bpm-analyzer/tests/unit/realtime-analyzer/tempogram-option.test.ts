import {expect} from 'chai';
import {createSession} from '../../../src/core/session';
import {resolveEngine, resolveOfflineEngine} from '../../../src/core/engine';
import type {ResolvedEngine} from '../../../src/core/engine';
import {createTempogramDetector} from '../../../src/core/tempogram';
import type {EngineOption, TempoRange, WorkletMessage} from '../../../src/contract/types';
import {analyzeChannelData} from '../../../src/node';
import {createClickTrack} from '../../fixtures/click-track';
import {feedSession} from '../../setup';

const sampleRate = 44_100;

async function streamResolved(engine: ResolvedEngine, tempoRange: TempoRange, pcm: Float32Array): Promise<WorkletMessage[]> {
  const session = createSession({engine, tempoRange, debug: false});
  return (await feedSession(session, pcm, sampleRate)).map(({message}) => message);
}

async function stream(engine: EngineOption | undefined, pcm: Float32Array, tempoRange?: TempoRange): Promise<WorkletMessage[]> {
  const resolved = resolveEngine(engine, tempoRange);
  return streamResolved(resolved.engine, resolved.tempoRange, pcm);
}

const readingsOf = (messages: readonly WorkletMessage[]): number[] =>
  messages.flatMap(message => (message.type === 'step' && message.status !== 'listening' ? [message.reading.bpm] : []));

// Literals on purpose: what the DECISION locked, not what the source holds today
const lockedRange = {min: 90, max: 180};
const lockedTuning = {priorBpm: 80, priorOctaves: 1.7, halfBeatPenalty: 0, thirdBeatPenalty: 0.3};

// The figures the docs give for custom ranges (the real-time guide). They describe the locked settings on clean
// clicks, and they only hold while those settings do.
describe('a custom tempogram range', () => {
  for (const [min, max, heard, read] of [
    [90, 180, 70, 140],
    [90, 180, 175, 175],
    [90, 180, 200, 100],
    [60, 180, 116, 116],
    [60, 180, 120, 60],
    [60, 180, 140, 140],
    [60, 180, 160, 80],
    [70, 140, 130, 130],
    [70, 140, 140, 70],
    [90, 240, 170, 170],
    [90, 240, 180, 90],
  ]) {
    it(`on ${min}-${max} reads ${heard} as ${read}`, async () => {
      const reading = await analyzeChannelData(createClickTrack(heard, sampleRate, 30), sampleRate, {
        engine: 'tempogram',
        tempoRange: {min, max},
      });

      expect(Math.round(reading!.bpm)).to.equal(read);
    });
  }
});

describe('one tempogram behaviour', () => {
  for (const [name, engine] of [
    ['bare', 'tempogram'],
    ['named mode', {name: 'tempogram', mode: 'extension'}],
  ] as const) {
    it(`reads the locked settings, as the ${name} option`, async () => {
      const pcm = createClickTrack(128, sampleRate, 20);
      const measured = await streamResolved({name: 'tempogram', tuning: lockedTuning}, lockedRange, pcm);

      expect(await stream(engine, pcm)).to.deep.equal(measured);
    });
  }

  it('reads a whole file with the locked settings, for analyzeChannelData and all that calls it', async () => {
    const seconds = 20;
    const pcm = createClickTrack(128, sampleRate, seconds);
    const measured = createTempogramDetector({
      sampleRate,
      tempoRange: lockedRange,
      tuning: {...lockedTuning, halfLifeSeconds: Number.POSITIVE_INFINITY},
    }).process(pcm);
    const reading = await analyzeChannelData(pcm, sampleRate, {engine: 'tempogram'});

    expect(reading?.bpm).to.equal(measured?.candidates[0].tempo);
    expect(reading?.candidates.map(({bpm}) => bpm)).to.deep.equal(measured?.candidates.slice(0, 5).map(({tempo}) => tempo));
  });

  it('reads fast music as itself on both paths, where the first pick read it at half', async () => {
    const pcm = createClickTrack(174, sampleRate, 30);
    const readings = readingsOf(await stream('tempogram', pcm));
    const whole = await analyzeChannelData(pcm, sampleRate, {engine: 'tempogram'});

    expect(readings.at(-1)).to.be.within(170, 178);
    expect(whole?.bpm).to.be.within(170, 178);
  });

  it('still lets a caller set the range searched', async () => {
    const reading = await analyzeChannelData(createClickTrack(128, sampleRate, 20), sampleRate, {engine: 'tempogram', tempoRange: {min: 50, max: 100}});

    expect(reading?.candidates.every(({bpm}) => bpm >= 50 && bpm <= 100)).to.equal(true);
  });
});

describe('the extension mode', () => {
  const extension = {name: 'tempogram', mode: 'extension'} as const;

  it('searches 90 to 180 BPM, so a fast pulse cannot read at half', async () => {
    const readings = readingsOf(await stream(extension, createClickTrack(170, sampleRate, 20)));

    expect(readings.at(-1)).to.be.within(165, 175);
  });

  it('accepts its own range, and refuses another or an unknown mode', () => {
    expect(() => resolveEngine(extension, {min: 90, max: 180})).to.not.throw();
    expect(() => resolveEngine(extension, {min: 50, max: 240})).to.throw(RangeError, 'another range');
    // @ts-expect-error Invalid on purpose
    expect(() => resolveEngine({name: 'tempogram', mode: 'magic'}, undefined)).to.throw(RangeError, 'Invalid engine.mode');
  });
});

describe('engine option', () => {
  // RBA-51 DECISION 2026-11-03: v6 runs the tempogram unless the caller asks for peaks
  it('defaults to the tempogram, realtime and offline', async () => {
    expect(resolveEngine(undefined, undefined).engine).to.deep.equal({name: 'tempogram'});
    expect(resolveOfflineEngine(undefined)).to.deep.equal({name: 'tempogram', lowpass: {}});
    expect((await analyzeChannelData(createClickTrack(128, sampleRate, 20), sampleRate))?.engine).to.equal('tempogram');
  });

  it('still runs peaks when asked by name, realtime and offline', async () => {
    expect(resolveEngine('peaks', undefined).engine).to.deep.equal({name: 'peaks'});
    expect(resolveEngine({name: 'peaks'}, undefined).engine).to.deep.equal({name: 'peaks'});
    expect(resolveOfflineEngine('peaks')).to.deep.equal({name: 'peaks', lowpass: {}});
    expect((await analyzeChannelData(createClickTrack(128, sampleRate, 20), sampleRate, {engine: 'peaks'}))?.engine).to.equal('peaks');
    const engines = (await stream('peaks', createClickTrack(128, sampleRate, 20)))
      .flatMap(message => (message.type === 'step' && message.status !== 'listening' ? [message.reading.engine] : []));
    expect(engines.length).to.be.greaterThan(0);
    expect(new Set(engines)).to.deep.equal(new Set(['peaks']));
  });

  it('refuses an unknown engine, and a restart period that is not a positive number', () => {
    // @ts-expect-error Invalid on purpose
    expect(() => resolveEngine('magic', undefined)).to.throw(RangeError, 'Invalid engine');
    expect(() => resolveEngine({name: 'peaks', restartAfterSeconds: 0}, undefined)).to.throw(RangeError, 'restartAfterSeconds');
    expect(() => resolveEngine({name: 'peaks', restartAfterSeconds: Number.NaN}, undefined)).to.throw(RangeError, 'restartAfterSeconds');
  });

  it('moves the tempogram through the same states as peaks: one first reading, then one lock', async () => {
    const messages = await stream('tempogram', createClickTrack(128, sampleRate, 20));
    const moves = messages.flatMap(message => (message.type === 'step' && message.reason !== undefined ? [`${message.status}/${message.reason}`] : []));
    const progress = messages.flatMap(message => (message.type === 'step' && message.status === 'listening' ? [message.progress] : []));

    expect(moves).to.deep.equal(['settling/first-reading', 'locked/locked']);
    expect(readingsOf(messages).length).to.be.greaterThan(10);
    // The main thread starts at 0; the first step reports what one buffer added
    expect(progress[0]).to.be.lessThan(0.1);
    expect(progress.every(fraction => fraction >= 0 && fraction <= 1)).to.equal(true);
  });

  it('starts the tempogram over when told to restart, with progress back at 0', async () => {
    const messages = await streamResolved({name: 'tempogram', restartAfterSeconds: 10}, lockedRange, createClickTrack(128, sampleRate, 14));
    const restart = messages.find(message => message.type === 'step' && message.reason === 'tempo-changed');

    expect(restart).to.deep.include({status: 'listening', progress: 0});
  });

  it('leaves the peaks engine reading what it read', async () => {
    const readings = readingsOf(await stream('peaks', createClickTrack(128, sampleRate, 20)));

    expect(readings.at(-1)).to.equal(128);
  });
});
