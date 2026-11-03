"""RBA-109: the beat dev and held-out split, written once to splits/beats.json.

`python3 -I benchmark/beats_split.py` from the package. It reads only the track ids of the committed
tempo splits, never a label, so it can run anywhere.

Rules, fixed before any beat was scored:
- A beat half sits inside the same tempo half. Tempo held-out was spent by RBA-51's looks and its
  labels stay unread, so beat dev takes only tempo-dev tracks, and beat held-out only tempo held-out
  tracks. Tracks that would cross are left out of both.
- No source on both sides. groove by drummer: each drummer goes to the side holding more of their
  tracks in the tempo split, a tie to held-out (the tempo split grouped by drummer and session, so
  110 of its 127 held-out tracks share a drummer with dev). guitarset by player: players ordered by
  sha256(seed + player), the first half to dev (the tempo split grouped by progression, so every
  player is on both sides). fsld keeps the tempo split, which already holds each uploader on one side.
- fsld-nc (non-commercial loops), the free mixes (tempo labels only, from trackers) and the
  evaluation-only sets are out.
- Held-out is sealed: its ids are hashed here and nothing in benchmark/beats_*.py reads them. The
  loop-length rule of beats_truth.py applies to fsld held-out at look time, as it did on dev.
"""

import hashlib
import json
import os

SEED = 'rba-109-2026-11-03'
HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name):
    with open(os.path.join(HERE, 'splits', f'{name}.json'), encoding='utf8') as handle:
        split = json.load(handle)
    return split['dev'], split['heldout']


def _by_majority(dev, heldout, source_of):
    """Each source to the side holding more of its tracks, a tie to held-out"""
    counts = {}
    for side, ids in (('dev', dev), ('heldout', heldout)):
        for track in ids:
            counts.setdefault(source_of(track), {'dev': 0, 'heldout': 0})[side] += 1
    return {s: 'dev' if c['dev'] > c['heldout'] else 'heldout' for s, c in counts.items()}


def _by_hash(dev, heldout, source_of):
    sources = sorted({source_of(t) for t in dev + heldout}, key=lambda s: hashlib.sha256((SEED + s).encode()).hexdigest())
    half = len(sources) // 2
    return {s: 'dev' if i < half else 'heldout' for i, s in enumerate(sources)}


def _apply(dev, heldout, side_of, source_of):
    return (sorted(t for t in dev if side_of[source_of(t)] == 'dev'),
            sorted(t for t in heldout if side_of[source_of(t)] == 'heldout'))


def seal(heldout):
    """sha256 of the held-out ids as canonical JSON: sorted keys, no spaces"""
    return hashlib.sha256(json.dumps(heldout, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def build():
    split = {'seed': SEED, 'dev': {}, 'heldout': {}, 'sources': {}}
    rules = {
        'groove': (lambda t: t.split('-')[0], _by_majority),
        'guitarset': (lambda t: t[:2], _by_hash),
        'fsld': (None, None),
    }
    for name, (source_of, rule) in rules.items():
        dev, heldout = _load(name)
        if rule is None:
            split['dev'][name], split['heldout'][name] = sorted(dev), sorted(heldout)
            continue
        side_of = rule(dev, heldout, source_of)
        split['dev'][name], split['heldout'][name] = _apply(dev, heldout, side_of, source_of)
        split['sources'][name] = dict(sorted(side_of.items()))
    split['heldoutSha256'] = seal(split['heldout'])
    return split


if __name__ == '__main__':
    result = build()
    with open(os.path.join(HERE, 'splits', 'beats.json'), 'w', encoding='utf8') as handle:
        json.dump(result, handle, indent=1, sort_keys=True)
        handle.write('\n')
    for name in result['dev']:
        print(name, 'dev', len(result['dev'][name]), 'heldout', len(result['heldout'][name]))
    print('heldoutSha256', result['heldoutSha256'])
