"""RBA-109: aggregates of beats_dev.py's rows, with 95% ranges from resampling sources.

The ranges resample whole sources (groove drummer, guitarset player, fsld uploader) within each set,
REPLICATES draws from Python's seeded generator, every statistic on the same draws so a difference is
paired. With 5 drummers and 3 players on dev, those sets' ranges are coarse, and say so.
"""

import json
import random
from collections import defaultdict

REPLICATES = 1000
SEED = 'rba-109-beats'
METRICS = ('F', 'F40', 'CMLt', 'AMLt')
METHODS = ('tracker', 'baseline', 'oracle')
SETS = ('groove', 'guitarset', 'fsld')
BANDS = (('under 90', 0, 90), ('90-140', 90, 140), ('140-165', 140, 165), ('165 and up', 165, 1e9))
OCTAVES = (2, 3, 1 / 2, 1 / 3)


def source_of(row):
    if row['set'] == 'groove':
        return row['id'].split('-')[0]
    if row['set'] == 'guitarset':
        return row['id'][:2]
    return row['group']


def tempo_class(row):
    engine, truth = row['offline'], row['trueBpm']
    if not engine:
        return 'no tempo'
    if abs(engine - truth) <= 0.04 * truth:
        return 'right tempo'
    if any(abs(engine - f * truth) <= 0.04 * f * truth for f in OCTAVES):
        return 'octave'
    return 'other'


def _percentile(values, q):
    if not values:
        return None
    ordered = sorted(values)
    position = q * (len(ordered) - 1)
    lo = int(position)
    hi = min(lo + 1, len(ordered) - 1)
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (position - lo)


def _draws(rows):
    """REPLICATES draws of source keys: whole sources with replacement, within each set"""
    rng = random.Random(SEED)
    keys_by_set = defaultdict(set)
    for row in rows:
        keys_by_set[row['set']].add((row['set'], source_of(row)))
    ordered = [sorted(keys) for _, keys in sorted(keys_by_set.items())]
    return [[rng.choice(keys) for keys in ordered for _ in keys] for _ in range(REPLICATES)]


def _per_source(rows, keep, value):
    """Per source key, (sum, count) of value over the rows kept"""
    sums = defaultdict(lambda: [0.0, 0])
    for row in rows:
        if keep(row):
            cell = sums[(row['set'], source_of(row))]
            cell[0] += value(row)
            cell[1] += 1
    return sums


def _mean_ranged(rows, draws, keep, value):
    sums = _per_source(rows, keep, value)
    total = [sum(c[i] for c in sums.values()) for i in (0, 1)]
    if total[1] == 0:
        return {'value': None}
    values = []
    for draw in draws:
        s = n = 0
        for key in draw:
            cell = sums.get(key)
            if cell:
                s, n = s + cell[0], n + cell[1]
        if n:
            values.append(s / n)
    return {'value': total[0] / total[1], 'lo': _percentile(values, 0.025), 'hi': _percentile(values, 0.975)}


def _scores_block(rows, draws, keep):
    block = {}
    for method in METHODS:
        block[method] = {m: _mean_ranged(rows, draws, keep, lambda r, a=method, m=m: r[a][m]) for m in METRICS}
    block['tracker - baseline'] = {
        m: _mean_ranged(rows, draws, keep, lambda r, m=m: r['tracker'][m] - r['baseline'][m]) for m in METRICS}
    block['tracks'] = sum(1 for r in rows if keep(r))
    return block


HISTOGRAM_MS = 400
# Fewer draws for the timing errors, as each sums histograms in pure Python: their ranges are coarser, as the report says
REALTIME_REPLICATES = 300


def _histograms(rows, h, keep):
    """Per source key, counts of |error| in 1 ms bins, the last bin holding everything past it"""
    out = defaultdict(lambda: [0] * (HISTOGRAM_MS + 1))
    for row in rows:
        if keep(row):
            bins = out[(row['set'], source_of(row))]
            for e in row['realtime'][h]:
                bins[min(HISTOGRAM_MS, int(abs(e) * 1000))] += 1
    return out


def _histogram_stats(bins):
    n = sum(bins)
    if n == 0:
        return None
    stats, running, wanted = {}, 0, {'median ms': 0.5, 'p90 ms': 0.9}
    for ms, count in enumerate(bins):
        running += count
        for name, q in list(wanted.items()):
            if running >= q * n:
                stats[name] = ms + 0.5
                del wanted[name]
    stats['within 20 ms'] = 100 * sum(bins[:20]) / n
    stats['within 40 ms'] = 100 * sum(bins[:40]) / n
    stats['predictions'] = n
    return stats


def _realtime_block(rows, draws, keep):
    block = {}
    for h in rows[0]['realtime']:
        per_source = _histograms(rows, h, keep)
        point = _histogram_stats([sum(col) for col in zip(*per_source.values())] if per_source else [])
        if point is None:
            block[h] = None
            continue
        sparse = {k: [(i, c) for i, c in enumerate(bins) if c] for k, bins in per_source.items()}
        drawn = []
        for draw in draws[:REALTIME_REPLICATES]:
            total = [0] * (HISTOGRAM_MS + 1)
            for key in draw:
                for i, c in sparse.get(key, ()):
                    total[i] += c
            drawn.append(_histogram_stats(total))
        drawn = [d for d in drawn if d]
        block[h] = {name: ({'value': value} if name == 'predictions' else
                           {'value': value, 'lo': _percentile([d[name] for d in drawn], 0.025),
                            'hi': _percentile([d[name] for d in drawn], 0.975)})
                    for name, value in point.items()}
    return block


def summarise(rows):
    scored = [r for r in rows if 'refused' not in r]
    draws = _draws(scored)
    every = lambda r: True
    out = {'tracks': {s: sum(1 for r in scored if r['set'] == s) for s in SETS},
           'refused': {s: sum(1 for r in rows if r['set'] == s and 'refused' in r) for s in SETS},
           'sources': {s: len({source_of(r) for r in scored if r['set'] == s}) for s in SETS},
           'beats': {s: sum(r['beats'] for r in scored if r['set'] == s) for s in SETS},
           'pooled': _scores_block(scored, draws, every)}
    for s in SETS:
        out[s] = _scores_block(scored, draws, lambda r, s=s: r['set'] == s)
    out['bands'] = {name: _scores_block(scored, draws, lambda r, lo=lo, hi=hi: lo <= r['trueBpm'] < hi)
                    for name, lo, hi in BANDS}
    out['tempo classes'] = {c: _scores_block(scored, draws, lambda r, c=c: tempo_class(r) == c)
                            for c in ('right tempo', 'octave', 'other', 'no tempo')}
    out['offset ms'] = {s: _percentile([o * 1000 for r in scored if r['set'] == s for o in r['offsets']], 0.5) for s in SETS}
    out['realtime'] = {'all': _realtime_block(scored, draws, every),
                       'right tempo': _realtime_block(scored, draws, lambda r: tempo_class(r) == 'right tempo')}
    for s in SETS:
        out['realtime'][s] = _realtime_block(scored, draws, lambda r, s=s: r['set'] == s)
    out['realtime missed'] = sum(r['missed'] for r in scored)
    return out


def report(rows_path, md_path, json_path):
    with open(rows_path, encoding='utf8') as handle:
        rows = [json.loads(line) for line in handle]
    summary = summarise(rows)
    with open(json_path, 'w', encoding='utf8') as handle:
        json.dump(summary, handle, indent=1)
    from beats_markdown import render
    with open(md_path, 'w', encoding='utf8') as handle:
        handle.write(render(summary))
