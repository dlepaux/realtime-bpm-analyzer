import {expect} from 'chai';
import {cacheStem} from '../../../benchmark/lib/cache-name';

const bytes = (text: string) => new TextEncoder().encode(text).length;

describe('benchmark cache names', () => {
  it('keeps an id that fits, so caches already written stay valid', () => {
    expect(cacheStem('fsld/track-01')).to.equal('fsld/track-01');
  });

  it('shortens a long id under the limit, the same way every time', () => {
    const id = `ia-${'x'.repeat(300)}`;

    expect(bytes(cacheStem(id))).to.be.at.most(200);
    expect(cacheStem(id)).to.equal(cacheStem(id));
    expect(cacheStem(id).startsWith('ia-xxx')).to.equal(true);
  });

  it('tells apart long ids that share their start', () => {
    const start = 'a'.repeat(250);

    expect(cacheStem(`${start}1`)).to.not.equal(cacheStem(`${start}2`));
  });

  it('counts bytes, not characters, and never splits one', () => {
    const stem = cacheStem('é'.repeat(150));

    expect(bytes(stem)).to.be.at.most(200);
    expect(stem.split('~')[0]).to.equal('é'.repeat(80));
  });
});
