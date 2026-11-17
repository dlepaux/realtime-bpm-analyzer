import {expect} from 'chai';
import {defaultMuteTimeInIndexes} from '../../src/core/consts';

describe('runtime defaults', () => {
  it('defaultMuteTimeInIndexes is a positive number at the expected value', () => {
    expect(defaultMuteTimeInIndexes).to.be.a('number');
    expect(defaultMuteTimeInIndexes).to.be.greaterThan(0);
    expect(defaultMuteTimeInIndexes).to.equal(10_000);
  });
});
