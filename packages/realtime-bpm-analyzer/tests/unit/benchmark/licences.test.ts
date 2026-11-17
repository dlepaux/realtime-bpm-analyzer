import {expect} from 'chai';
import {assertLicenceClean, assertTunable, assertTunableSets, evaluationOnly} from '../../../benchmark/lib/licences';
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

  describe('contested labels', () => {
    it('are refused by tuning, by track and by set name', () => {
      expect(() => {
        assertTunable([track('free-mixes', 'CC-BY-4.0'), track('free-mixes-contested', 'CC-BY-4.0')]);
      }).to.throw('free-mixes-contested');
      expect(() => {
        assertTunableSets(['fsld', 'free-mixes', 'free-mixes-contested']);
      }).to.throw('free-mixes-contested');
      expect(() => {
        assertTunableSets(['fsld', 'groove', 'guitarset', 'free-mixes']);
      }).to.not.throw();
    });

    it('may still be scored on dev, unlike an evaluation-only set', () => {
      expect(() => {
        assertLicenceClean([track('free-mixes-contested', 'CC-BY-SA-3.0'), track('free-mixes', 'CC0-1.0')]);
      }).to.not.throw();
      expect(() => {
        assertLicenceClean([track('gtzan', 'CC0-1.0')]);
      }).to.throw('gtzan');
    });
  });
});
