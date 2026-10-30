import {expect} from 'chai';
import {defaultMuteTimeInIndexes, defaultStabilizationTime} from '../../src/core/consts';

describe('runtime defaults', () => {
  it('defaultStabilizationTime is a positive number at the expected value', () => {
    expect(defaultStabilizationTime).to.be.a('number');
    expect(defaultStabilizationTime).to.be.greaterThan(0);
    expect(defaultStabilizationTime).to.equal(20_000);
  });

  it('defaultMuteTimeInIndexes is a positive number at the expected value', () => {
    expect(defaultMuteTimeInIndexes).to.be.a('number');
    expect(defaultMuteTimeInIndexes).to.be.greaterThan(0);
    expect(defaultMuteTimeInIndexes).to.equal(10_000);
  });
});
