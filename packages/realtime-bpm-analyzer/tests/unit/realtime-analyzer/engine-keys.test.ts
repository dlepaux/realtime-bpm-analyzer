import {expect} from 'chai';
import {assertNoRemovedOptions, resolveEngine, resolveOfflineEngine} from '../../../src/core/engine';
import type {EngineOption, OfflineEngineOption} from '../../../src/contract/types';

// RBA-108's DECISION of 2026-11-16: `engine` is strict like `lowpass`. A key outside the engine's set throws a
// TypeError that names it, whatever its value, so a call can't pass in a test and then throw on other data.

const sampleRate = 44_100;

/**
 * The error a call throws, or undefined
 * @param call The call
 * @returns What it threw
 */
function caught(call: () => unknown): unknown {
  try {
    call();
  } catch (error) {
    return error;
  }

  return undefined;
}

/** The key part of every message that turns a lowpass away from the realtime analyzer */
function expectRealtimeLowpassPointer(message: string): void {
  expect(message).to.contain('analyzer.input');
  expect(message).to.contain('analyzeFullBuffer');
  expect(message).to.contain('analyzeChannelData');
}

describe('engine keys, realtime', () => {
  it('refuses a lowpass on either engine, and says where a lowpass is taken', () => {
    for (const engine of [
      {name: 'peaks', lowpass: {frequency: 150}},
      {name: 'peaks', lowpass: undefined},
      {name: 'tempogram', lowpass: {}},
    ]) {
      const error = caught(() => resolveEngine(engine as unknown as EngineOption, undefined));

      expect(error, JSON.stringify(engine)).to.be.instanceOf(TypeError);
      expect((error as Error).message).to.contain('lowpass');
      expectRealtimeLowpassPointer((error as Error).message);
    }
  });

  it('refuses a key the named engine does not take, or a typo, naming the key', () => {
    const refused: Array<[unknown, string]> = [
      [{name: 'tempogram', restartAfterSeconds: 30}, 'restartAfterSeconds'],
      [{name: 'peaks', restartAfterSecond: 20}, 'restartAfterSecond'],
      [{name: 'peaks', mode: 'measured'}, 'mode'],
      [{name: 'tempogram', mod: 'measured'}, 'mod'],
      // Its presence is the error, whatever its value
      [{name: 'tempogram', restartAfterSeconds: undefined}, 'restartAfterSeconds'],
    ];
    for (const [engine, key] of refused) {
      const error = caught(() => resolveEngine(engine as EngineOption, undefined));

      expect(error, JSON.stringify(engine)).to.be.instanceOf(TypeError);
      expect((error as Error).message).to.contain(` ${key}`);
    }
  });

  it('accepts every key each engine takes, and null or undefined for the default', () => {
    const accepted: Array<[unknown, unknown]> = [
      [undefined, {name: 'tempogram'}],
      [null, {name: 'tempogram'}],
      ['peaks', {name: 'peaks'}],
      ['tempogram', {name: 'tempogram'}],
      [{name: 'peaks'}, {name: 'peaks'}],
      [{name: 'peaks', restartAfterSeconds: 20}, {name: 'peaks', restartAfterSeconds: 20}],
      [{name: 'peaks', restartAfterSeconds: undefined}, {name: 'peaks'}],
      [{name: 'tempogram'}, {name: 'tempogram'}],
      [{name: 'tempogram', mode: 'measured'}, {name: 'tempogram'}],
      [{name: 'tempogram', mode: undefined}, {name: 'tempogram'}],
    ];
    for (const [engine, resolved] of accepted) {
      expect(resolveEngine(engine as EngineOption, undefined).engine, JSON.stringify(engine)).to.deep.equal(resolved);
    }
  });
});

describe('engine keys, whole buffer', () => {
  it('refuses a key peaks does not take, or a typo, naming the key', () => {
    const refused: Array<[unknown, string]> = [
      [{name: 'peaks', lowpas: {frequency: 150}}, 'lowpas'],
      [{name: 'peaks', restartAfterSeconds: 20}, 'restartAfterSeconds'],
      [{name: 'peaks', mode: 'measured'}, 'mode'],
      [{name: 'peaks', lowpas: undefined}, 'lowpas'],
    ];
    for (const [engine, key] of refused) {
      const error = caught(() => resolveOfflineEngine(engine as OfflineEngineOption, sampleRate));

      expect(error, JSON.stringify(engine)).to.be.instanceOf(TypeError);
      expect((error as Error).message).to.contain(` ${key}`);
    }
  });

  it('accepts every key peaks takes, and null or undefined for the default', () => {
    const accepted: Array<[unknown, unknown]> = [
      [undefined, {name: 'tempogram', lowpass: {}}],
      [null, {name: 'tempogram', lowpass: {}}],
      ['peaks', {name: 'peaks', lowpass: {}}],
      ['tempogram', {name: 'tempogram', lowpass: {}}],
      [{name: 'peaks'}, {name: 'peaks', lowpass: {frequency: undefined, q: undefined}}],
      [{name: 'peaks', lowpass: undefined}, {name: 'peaks', lowpass: {frequency: undefined, q: undefined}}],
      [{name: 'peaks', lowpass: null}, {name: 'peaks', lowpass: {frequency: undefined, q: undefined}}],
      [{name: 'peaks', lowpass: {frequency: 150, q: 2}}, {name: 'peaks', lowpass: {frequency: 150, q: 2}}],
    ];
    for (const [engine, resolved] of accepted) {
      expect(resolveOfflineEngine(engine as OfflineEngineOption, sampleRate), JSON.stringify(engine)).to.deep.equal(resolved);
    }
  });
});

describe('the 5.x lowpass options', () => {
  it('say that realtime peaks has a fixed lowpass, and which functions take one', () => {
    for (const options of [{frequencyValue: 150}, {qualityValue: 1}]) {
      const error = caught(() => {
        assertNoRemovedOptions(options);
      });

      expect(error, JSON.stringify(options)).to.be.instanceOf(TypeError);
      expect((error as Error).message).to.contain(Object.keys(options)[0]).and.to.contain('lowpass');
      expectRealtimeLowpassPointer((error as Error).message);
    }
  });
});
