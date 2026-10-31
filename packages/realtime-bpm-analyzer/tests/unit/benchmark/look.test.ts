import {expect} from 'chai';
import {lookHeader, progressRows, resumesLook} from '../../../benchmark/lib/look';

const row = (id: string) => `\n${JSON.stringify({detector: 'peaks', result: {id}})}\n`;

describe('benchmark held-out looks', () => {
  it('starts a new look when no progress exists, so deleting the files logs again', () => {
    expect(resumesLook('', 'look a')).to.equal(false);
  });

  it('resumes only the look its progress file names', () => {
    const progress = lookHeader('look a') + row('1');

    expect(resumesLook(progress, 'look a')).to.equal(true);
    expect(() => resumesLook(progress, 'look b')).to.throw('another look');
  });

  it('refuses results that name no look, since they would score unlogged', () => {
    expect(() => resumesLook(row('1'), 'look a')).to.throw('another look');
  });

  it('keeps results and drops the header and a torn last line', () => {
    const rows = progressRows<{result: {id: string}}>(`${lookHeader('look a')}${row('1')}${row('2')}{"detector":"pe`);

    expect(rows.map(({result}) => result.id)).to.deep.equal(['1', '2']);
  });
});
