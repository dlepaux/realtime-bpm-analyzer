import {expect} from 'chai';
import {repeatTo} from '../../../benchmark/lib/stream';

describe('repeatTo', () => {
  it('repeats whole passes, so a loop never ends on a cut beat', () => {
    expect([...repeatTo(new Float32Array([1, 2, 3]), 7)]).to.deep.equal([1, 2, 3, 1, 2, 3, 1, 2, 3]);
  });

  it('keeps audio that is already long enough', () => {
    expect([...repeatTo(new Float32Array([1, 2, 3]), 3)]).to.deep.equal([1, 2, 3]);
  });
});
