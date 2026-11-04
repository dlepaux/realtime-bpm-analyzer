import {expect} from 'chai';
import {compatibleProtocol, describeProtocol, mayAddTypes} from '../../../src/contract/protocol';
import {PROTOCOL} from '../../../src/contract/types';

describe('v6 protocol: semver rule', () => {
  const {major, minor} = PROTOCOL;

  it('talks to any minor of its own major, older and newer included', () => {
    for (const peer of [{major, minor}, {major, minor: minor + 1}, {major, minor: minor + 7}]) {
      expect(compatibleProtocol(peer), JSON.stringify(peer)).to.deep.equal(peer);
    }
  });

  it('refuses another major, a 5.x number and anything that is not a pair of counts', () => {
    const refused = [
      {major: major + 1, minor}, {major: major - 1, minor}, major, '1.0', null, undefined,
      {major}, {major, minor: -1}, {major, minor: 0.5}, {major: String(major), minor},
    ];
    for (const value of refused) {
      expect(compatibleProtocol(value), JSON.stringify(value)).to.equal(null);
    }
  });

  it('lets an unknown message type pass only from a later minor', () => {
    expect(mayAddTypes({major, minor: minor + 1})).to.equal(true);
    expect(mayAddTypes({major, minor})).to.equal(false);
    expect(mayAddTypes({major, minor: 1}, {major, minor: 2}), 'an older minor').to.equal(false);
  });

  it('names a version as major.minor, and anything else as it came', () => {
    expect(describeProtocol({major: 1, minor: 2})).to.equal('1.2');
    expect(describeProtocol(1)).to.equal('1');
    expect(describeProtocol(undefined)).to.equal('none');
  });
});
