import {expect} from 'chai';
import {assertTunable, evaluationOnly} from '../../../benchmark/lib/licences';
import type {Track} from '../../../benchmark/lib/types';

function track(set: string, licence: string): Track {
  return {set, id: 'a', genre: 'g', bpm: 120, group: 'a', audioPath: '', licence};
}

describe('benchmark licence gate', () => {
  it('lets licence-clean items through', () => {
    expect(() => {
      assertTunable([track('fsld', 'CC0-1.0'), track('fsld', 'CC-BY-3.0'), track('groove', 'CC-BY-4.0'), track('guitarset', 'CC-BY-4.0')]);
    }).to.not.throw();
  });

  for (const set of ['giantsteps', 'ballroom', 'gtzan', 'fsld-nc']) {
    it(`refuses ${set}, whatever licence an item claims`, () => {
      expect(() => {
        assertTunable([track(set, evaluationOnly)]);
      }).to.throw(set);
      expect(() => {
        assertTunable([track(set, 'CC0-1.0')]);
      }).to.throw(set);
    });
  }

  it('refuses a set nobody has checked', () => {
    expect(() => {
      assertTunable([track('new-set', 'CC0-1.0')]);
    }).to.throw('new-set');
  });

  it('refuses one item without a clean licence in a clean set', () => {
    expect(() => {
      assertTunable([track('fsld', 'CC0-1.0'), track('fsld', 'CC-BY-NC-3.0')]);
    }).to.throw('CC-BY-NC-3.0');
  });
});
