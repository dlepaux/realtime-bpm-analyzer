import {expect} from 'chai';

import * as utils from '../../src/utils';

export default () => {
  describe('Utils - Unit tests', () => {
    it('should test threshold value with stop call', done => {
      const object = {
        foo: 0,
      };

      utils.descendingOverThresholds(async threshold => {
        // We add an entry to object
        object.foo = threshold;
        // Stop the loop at first iteration
        return true;
      }).then(() => {
        // Check if object have only ONE entry
        expect(JSON.stringify(object)).to.be.equal('{"foo":0.8999999999999999}');
        done();
      }).catch((error: unknown) => {
        done(error);
      });
    });

    it('should test threshold value with boolean', done => {
      const object = {
        foo: 0,
      };

      utils.descendingOverThresholds(async threshold => {
        // We add an entry to object
        object.foo = threshold;
        // Stop the loop at first iteration
        return true;
      }).then(() => {
        expect(JSON.stringify(object)).to.be.equal('{"foo":0.8999999999999999}');
        done();
      }).catch((error: unknown) => {
        done(error);
      });
    });

    it('should test threshold without minThreshold', done => {
      const object: Record<string, number> = {
        '0.4': 0,
      };

      utils.descendingOverThresholds(async threshold => {
        // We add an entry to object
        object[threshold] = threshold;
        return false;
      }).then(() => {
        done();
      }).catch((error: unknown) => {
        done(error);
      });
    });

    it('should create the model with the default value', done => {
      const object = utils.generateValidPeaksModel();
      expect(JSON.stringify(Object.values(object)[0])).to.be.equal('[]');
      done();
    });

    it('should create the model with the default value', done => {
      const object = utils.generateNextIndexPeaksModel();
      expect(JSON.stringify(Object.values(object)[0])).to.be.equal('0');
      done();
    });
  });
};
