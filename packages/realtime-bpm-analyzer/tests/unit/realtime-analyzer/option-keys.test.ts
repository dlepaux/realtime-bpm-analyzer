import {expect} from 'chai';
import {assertOptions, optionKeys} from '../../../src/core/engine';
import {resolveTempoRange, tempoRangeKeys} from '../../../src/core/tempo';
import type {TempoRange} from '../../../src/contract/types';

// The top-level options are strict, as `engine` and `lowpass` are. A key outside
// the function's set throws a TypeError that names it, whatever its value, after the 5.x names' own messages.
// TempoRange follows the same ruling: it takes min and max only.

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

function expectRefused(call: () => unknown, key: string, label: string): Error {
  const error = caught(call);
  expect(error, label).to.be.instanceOf(TypeError);
  expect((error as Error).message, label).to.contain(` ${key}`);
  return error as Error;
}

describe('option keys', () => {
  it('lists the keys each function takes', () => {
    expect(optionKeys.realtime).to.deep.equal(['engine', 'tempoRange', 'processorUrl', 'liveInput', 'debug']);
    expect(optionKeys.offline).to.deep.equal(['engine', 'tempoRange']);
    expect(Object.isFrozen(optionKeys) && Object.isFrozen(optionKeys.realtime) && Object.isFrozen(optionKeys.offline)).to.equal(true);
  });

  it('refuses a typo or an unknown key on either path, naming it, whatever its value', () => {
    for (const path of ['realtime', 'offline'] as const) {
      for (const [options, key] of [
        [{engin: 'peaks'}, 'engin'],
        [{tempRange: {min: 60, max: 120}}, 'tempRange'],
        [{engine: 'peaks', tempoRang: undefined}, 'tempoRang'],
        [{constructor: 1}, 'constructor'],
      ] as const) {
        expectRefused(() => {
          assertOptions(options, path);
        }, key, `${path} ${JSON.stringify(options)}`);
      }
    }
  });

  it('refuses the realtime-only options in whole-buffer analysis, and says which function takes them', () => {
    for (const key of ['processorUrl', 'liveInput', 'debug']) {
      const error = expectRefused(() => {
        assertOptions({[key]: undefined}, 'offline');
      }, key, key);
      expect(error.message).to.match(/^analyzeFullBuffer and analyzeChannelData take no option /);
      expect(error.message).to.contain('createRealtimeBpmAnalyzer');
      // One sentence, one reason: a second colon read as a list of reasons
      expect(error.message.split(': ').length, key).to.equal(2);
    }
  });

  it('names the function a realtime option went to', () => {
    const error = expectRefused(() => {
      assertOptions({engin: 'peaks'}, 'realtime');
    }, 'engin', 'realtime engin');
    expect(error.message).to.equal('createRealtimeBpmAnalyzer takes no option engin: its options are engine, tempoRange, processorUrl, liveInput and debug.');
  });

  it('points an engine setting given at the top level to engine', () => {
    for (const [path, key] of [['realtime', 'restartAfterSeconds'], ['realtime', 'mode'], ['offline', 'lowpass']] as const) {
      const error = expectRefused(() => {
        assertOptions({[key]: undefined}, path);
      }, key, `${path} ${key}`);
      expect(error.message).to.contain('engine: {name:');
      // One sentence, one reason: outside the code it quotes, a second colon read as a list of reasons
      expect(error.message.replace(/engine: \{[^}]*\}/, '').split(': ').length, `${path} ${key}`).to.equal(2);
    }

    const realtimeLowpass = expectRefused(() => {
      assertOptions({lowpass: {frequency: 150}}, 'realtime');
    }, 'lowpass', 'realtime lowpass');
    expect(realtimeLowpass.message).to.contain('analyzer.input');
  });

  it('keeps the 5.x names\' own messages, and refuses them even when undefined', () => {
    for (const path of ['realtime', 'offline'] as const) {
      for (const options of [{detector: 'peaks'}, {detector: undefined}, {engine: 'peaks', continuousAnalysis: undefined}]) {
        const error = caught(() => {
          assertOptions(options, path);
        });
        expect(error, `${path} ${JSON.stringify(options)}`).to.be.instanceOf(TypeError);
        expect((error as Error).message).to.match(/^The option \w+ was removed in v6: /);
      }
    }
  });

  it('accepts every key each function takes, set or undefined, and no options at all', () => {
    const realtime = {engine: 'peaks', tempoRange: {min: 90, max: 180}, processorUrl: '/p.js', liveInput: undefined, debug: false};
    for (const options of [undefined, null, {}, realtime, Object.fromEntries(optionKeys.realtime.map(key => [key, undefined]))]) {
      expect(() => {
        assertOptions(options, 'realtime');
      }, JSON.stringify(options)).to.not.throw();
    }

    for (const options of [undefined, null, {}, {engine: 'peaks', tempoRange: {min: 90, max: 180}}, {engine: undefined, tempoRange: undefined}]) {
      expect(() => {
        assertOptions(options, 'offline');
      }, JSON.stringify(options)).to.not.throw();
    }
  });

  it('refuses options that are not an object, null or undefined, naming the type and never the value', () => {
    for (const [options, kind] of [['peaks', 'a string'], [150, 'a number'], [['x'], 'an array'], [true, 'a boolean']] as const) {
      for (const path of ['realtime', 'offline'] as const) {
        const error = caught(() => {
          assertOptions(options, path);
        });
        expect(error, `${path} ${String(options)}`).to.be.instanceOf(TypeError);
        expect((error as Error).message).to.contain(kind).and.not.to.contain(String(options));
      }
    }
  });
});

describe('tempoRange keys', () => {
  it('takes min and max only', () => {
    expect(tempoRangeKeys).to.deep.equal(['min', 'max']);
    expect(Object.isFrozen(tempoRangeKeys)).to.equal(true);
  });

  it('refuses any other key, naming it, whatever its value', () => {
    const refused: Array<[unknown, string]> = [
      [{min: 60, max: 120, mni: 50}, 'mni'],
      [{min: 60, max: 120, step: undefined}, 'step'],
    ];
    for (const [range, key] of refused) {
      const error = expectRefused(() => resolveTempoRange(range as TempoRange), key, JSON.stringify(range));
      expect(error.message).to.equal(`Invalid tempoRange: it takes only min and max, not ${key}.`);
    }
  });

  it('still accepts min and max alone', () => {
    expect(resolveTempoRange({min: 60, max: 120})).to.deep.equal({min: 60, max: 120});
  });
});
