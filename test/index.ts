import {expect} from 'chai';
import {describe, it} from 'mocha';

import {descendingOverThresholds, generateValidPeaksModel, generateNextIndexPeaksModel} from '../src/utils';

/**
 * Unit test for the RealTime BPM Analyzer
 */
describe('RealTime BPM Analyzer', () => {
  /**
   * Test Utility functions
   */
  describe('Utils.descendingOverThresholds', () => {
    it('should test threshold value with stop call', done => {
      const object = {
        foo: 0,
      };

      descendingOverThresholds(async threshold => {
        // We add an entry to object
        object.foo = threshold;
        // Stop the loop at first iteration
        return true;
      }).then(() => {
        // Check if object have only ONE entry
        expect(JSON.stringify(object)).to.be.equal('{"foo":0.8999999999999999}');
        done();
      }).catch((error: unknown) => {
        console.error(error);
      });
    });

    it('should test threshold value with boolean', done => {
      const object = {
        foo: 0,
      };

      descendingOverThresholds(async threshold => {
        // We add an entry to object
        object.foo = threshold;
        // Stop the loop at first iteration
        return true;
      }).then(() => {
        expect(JSON.stringify(object)).to.be.equal('{"foo":0.8999999999999999}');
        done();
      }).catch((error: unknown) => {
        console.error(error);
      });
    });

    it('should test threshold without minThreshold', done => {
      const object = {
        foo: 0,
      };

      descendingOverThresholds(async threshold => {
        // We add an entry to object
        object[threshold] = threshold;
        return false;
      }).then(() => {
        done();
      }).catch((error: unknown) => {
        console.error(error);
      });
    });

    it('should create the model with the default value', done => {
      const object = generateValidPeaksModel();
      expect(JSON.stringify(Object.values(object)[0])).to.be.equal('[]');
      done();
    });
    it('should create the model with the default value', done => {
      const object = generateNextIndexPeaksModel();
      expect(JSON.stringify(Object.values(object)[0])).to.be.equal('0');
      done();
    });
  });
});
