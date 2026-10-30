import {expect} from 'chai';
import {assignSplit, fnv1a} from '../../../benchmark/lib/split';
import type {Track} from '../../../benchmark/lib/types';

function tracks(count: number): Track[] {
  return Array.from({length: count}, (_, i) => ({
    set: 's',
    id: `t${i}`,
    genre: i % 2 === 0 ? 'a' : 'b',
    bpm: 120,
    group: `g${Math.floor(i / 4)}`,
    audioPath: '',
  }));
}

describe('benchmark split', () => {
  it('hashes deterministically, and differently under another prefix', () => {
    expect(fnv1a('seed:a')).to.equal(fnv1a('seed:a'));

    const order = (prefix: string) => ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8']
      .sort((a, b) => fnv1a(prefix + a) - fnv1a(prefix + b))
      .join();

    expect(order('one:')).to.not.equal(order('other:'));
  });

  it('depends only on the seed and the ids, not on their order', () => {
    const all = tracks(80);
    const forward = assignSplit(all, 'seed');
    const backward = assignSplit([...all].reverse(), 'seed');

    for (const track of all) {
      expect(backward.get(track.id)).to.equal(forward.get(track.id));
    }
  });

  it('never separates a group', () => {
    const all = tracks(80);
    const split = assignSplit(all, 'seed');

    for (const track of all) {
      const sibling = all.find(other => other.group === track.group)!;

      expect(split.get(track.id)).to.equal(split.get(sibling.id));
    }
  });

  it('balances each genre', () => {
    const all = Array.from({length: 100}, (_, i) => ({...tracks(1)[0], id: `t${i}`, group: `g${i}`, genre: i < 30 ? 'a' : 'b'}));
    const split = assignSplit(all, 'seed');
    const devOf = (genre: string) => all.filter(track => track.genre === genre && split.get(track.id) === 'dev').length;

    expect(devOf('a')).to.equal(15);
    expect(devOf('b')).to.equal(35);
  });

  it('changes with the seed', () => {
    const all = tracks(80);
    const one = assignSplit(all, 'one');
    const other = assignSplit(all, 'other');

    expect(all.some(track => one.get(track.id) !== other.get(track.id))).to.equal(true);
  });
});
