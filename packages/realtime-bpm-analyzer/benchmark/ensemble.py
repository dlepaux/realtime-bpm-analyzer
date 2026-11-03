"""RBA-106: peaks and the 5.5.0 tempogram run together, on dev only.

Reads a dev result file from the batch job (`_job/dev-<commit>.json`, both engines on the real path) and
prints aggregates as markdown. It never reads a held-out file: it refuses any file whose `split` is not
`dev`, and the job writes held-out output to other names.

It runs where the data lives, on the standard library alone: `python3 -I benchmark/ensemble.py <dev.json>`.

The error ranges follow lib/pass-bar.ts: a 95% percentile range from a bootstrap that resamples whole
groups (artists for the free mixes) within each set, every statistic on the same draws so differences are
paired. The draws come from Python's own seeded generator, so the ranges are not draw-for-draw those of the
TypeScript reports, only the same method.

Every rule here is fixed on dev. A held-out check of any of them would be a second look and needs its own
DECISION on RBA-106.
"""

from array import array
import json
import math
import random
import sys
from collections import defaultdict

REPLICATES = 4000
SEED = 'rba-106-ensemble'
TOLERANCE = 0.04
ACC2_FACTORS = (1, 2, 3, 1 / 2, 1 / 3)
FIELD_BITS = 32

BANDS = (
    ('under 90', lambda t: t < 90),
    ('90-140', lambda t: 90 <= t < 140),
    ('140-165', lambda t: 140 <= t < 165),
    ('165-180', lambda t: 165 <= t <= 180),
    ('over 180', lambda t: t > 180),
)
TIERS = {'free-mixes': 'strict', 'free-mixes-contested': 'contested'}
CLEAN_SETS = ('fsld', 'groove', 'guitarset')

# Agreement classes of the two final readings, most agreeing first. `octave` is a ratio of 2 or 1/2 within 2%
CLASSES = ('agree2', 'agree2to4', 'octave', 'other', 'tempogram only', 'peaks only', 'neither')
# How much each class trusts the reading, for the ranking measures: a higher level must mean more agreement
AGREEMENT_LEVEL = {'agree2': 4, 'agree2to4': 3, 'octave': 2, 'other': 1, 'tempogram only': 0, 'peaks only': 0}
CONFIDENCE_BINS = 20
# The ranking and timing measures only read these scopes, which keeps the tally small enough to resample
HEADLINE = ('all dev', 'free mixes, strict', 'free mixes, contested', 'fsld + groove + guitarset')


def is_correct(reading, truth):
    return reading is not None and abs(reading - truth) <= TOLERANCE * truth


def is_octave_correct(reading, truth):
    return reading is not None and any(is_correct(reading, truth * f) for f in ACC2_FACTORS)


def within(a, b, ratio):
    """True when a and b are within `ratio` of each other, symmetric in a and b"""
    return abs(math.log(a / b)) <= math.log(1 + ratio)


def agreement(t, p):
    if t is None and p is None:
        return 'neither'
    if p is None:
        return 'tempogram only'
    if t is None:
        return 'peaks only'
    if within(t, p, 0.02):
        return 'agree2'
    if within(t, p, 0.04):
        return 'agree2to4'
    if within(t, 2 * p, 0.02) or within(2 * t, p, 0.02):
        return 'octave'
    return 'other'


RELATIONS = (('3/2', 1.5), ('2/3', 2 / 3), ('4/3', 4 / 3), ('3/4', 3 / 4), ('3', 3), ('1/3', 1 / 3))


def relation(t, p):
    """For the `other` class: tempogram over peaks as a simple ratio, when it is one within 2%"""
    return next((name for name, r in RELATIONS if within(t, p * r, 0.02)), 'none simple')


def lock_class(lock_t, lock_p):
    if lock_t is not None and lock_p is not None:
        return 'both lock'
    if lock_t is not None:
        return 'tempogram lock only'
    return 'peaks lock only' if lock_p is not None else 'no lock'


LOCK_CLASSES = ('both lock', 'tempogram lock only', 'peaks lock only', 'no lock')


def band_of(truth):
    return next(name for name, test in BANDS if test(truth))


def scopes_of(row):
    """The table rows a track counts in"""
    tier = TIERS.get(row['set'])
    band = band_of(row['truth'])
    scopes = ['all dev']
    if tier is None:
        scopes.append('fsld + groove + guitarset')
        return scopes
    scopes += [f'free mixes, {tier}', f'{band}, free mixes, {tier}', f'{band}, free mixes, both tiers']
    return scopes


def stable_at(stable, at):
    """The engine's latest bpmStable reading heard by `at`, None before the first"""
    kept = None
    for heard, bpm in stable:
        if heard > at:
            break
        kept = bpm
    return kept


def first_agreement(t_events, p_events, ratio):
    """
    Earliest moment both engines' current readings agree within `ratio`, from two timelines of
    [seconds, bpm]. Returns (seconds, tempogram reading then) or None
    """
    moments = sorted({heard for heard, _ in t_events} | {heard for heard, _ in p_events})
    for at in moments:
        t, p = stable_at(t_events, at), stable_at(p_events, at)
        if t is not None and p is not None and within(t, p, ratio):
            return at, t
    return None


def reading_names(row_t, row_p, cls):
    """Q1 to Q3 on the final readings: the class, and who reads and is right within it"""
    truth, t, p = row_t['truth'], row_t['final'], row_p['final']
    names = ['n', f'class|{cls}']
    for engine, reading in (('t', t), ('p', p), ('c', t if t is not None else p)):
        for kept, name in ((reading is not None, 'read'), (is_correct(reading, truth), 'acc1'), (is_octave_correct(reading, truth), 'acc2')):
            if kept:
                names += [f'{engine}|{name}', f'{engine}|{name}|{cls}']
    if cls == 'other':
        names.append(f'relation|{relation(t, p)}')
    return names


def lock_names(row_t, row_p):
    """Q3: coverage in the reports is a bpmStable lock, so the fallback is peaks' lock where the tempogram has none"""
    truth = row_t['truth']
    lock_t = row_t['stable'][0][1] if row_t['stable'] else None
    lock_p = row_p['stable'][0][1] if row_p['stable'] else None
    lock_cls = lock_class(lock_t, lock_p)
    names = [f'lock-class|{lock_cls}']
    for engine, reading in (('t', lock_t), ('p', lock_p), ('c', lock_t if lock_t is not None else lock_p)):
        if reading is not None:
            names.append(f'{engine}-lock|read')
        for kept, name in ((is_correct(reading, truth), 'acc1'), (is_octave_correct(reading, truth), 'acc2')):
            if kept:
                names += [f'{engine}-lock|{name}', f'{engine}-lock|{name}|{lock_cls}']
    for engine, reading in (('t', row_t['final']), ('p', row_p['final'])):
        if is_correct(reading, truth):
            names.append(f'{engine}|acc1|lock {lock_cls}')
    lock_k = lock_t if lock_t is not None else confirmed_peaks_lock(row_t, row_p)
    for kept, name in ((lock_k is not None, 'read'), (is_correct(lock_k, truth), 'acc1'), (is_octave_correct(lock_k, truth), 'acc2')):
        if kept:
            names.append(f'k-lock|{name}')
    return names


def tie_names(row_t, row_p, cls):
    """Q4: inside a half or double disagreement, which simple rule picks the right reading"""
    if cls != 'octave':
        return []
    truth, t, p = row_t['truth'], row_t['final'], row_p['final']
    # The last rule follows whichever engine is locked, the tempogram when both or neither are
    locked_pick = p if (row_p['stable'] and not row_t['stable']) else t
    rules = (('tempogram', t), ('peaks', p), ('faster', max(t, p)), ('slower', min(t, p)), ('locked', locked_pick))
    return [f'tie|{rule}' for rule, pick in rules if is_correct(pick, truth)]


def rank_names(row_t, row_p, cls, edges):
    """Q2 and Q6: each signal's level, against Acc1 of the reading it vouches for"""
    return [f"rank|{name}|{level}|{'pos' if is_correct(reading, row_t['truth']) else 'neg'}"
            for name, reading, level in rankers(row_t, row_p, cls, edges) if reading is not None and level is not None]


def timing_names(row_t, row_p):
    """Q5: the tempogram's first lock against the first agreement, from the bpmStable and reading timelines"""
    truth = row_t['truth']
    names = []
    first_t = row_t['stable'][0] if row_t['stable'] else None
    if first_t is not None:
        names += ['lock|t'] + (['lock|t|acc1'] if is_correct(first_t[1], truth) else [])
    agreed = first_agreement(row_t['stable'], row_p['stable'], TOLERANCE)
    if agreed is not None:
        names.append('agree-lock')
        names += ['agree-lock|acc1'] if is_correct(agreed[1], truth) else []
        names += ['agree-lock|after-t'] if first_t is not None and agreed[0] > first_t[0] else []
        names += ['agree-lock|t-first-acc1'] if first_t is not None and is_correct(first_t[1], truth) else []
    if row_t.get('readings') is not None:
        seen = first_agreement([(h, b) for h, b, _ in row_t['readings']], [(h, b) for h, b, _ in row_p['readings']], 0.02)
        if seen is not None:
            names += ['agree-reading'] + (['agree-reading|acc1'] if is_correct(seen[1], truth) else [])
    return names


def track_keys(row_t, row_p, edges):
    """Every count one track adds, as keys of a tally: each name once per scope the track counts in"""
    cls = agreement(row_t['final'], row_p['final'])
    names = reading_names(row_t, row_p, cls) + lock_names(row_t, row_p) + tie_names(row_t, row_p, cls)
    # The ranking and timing measures only read the headline scopes
    headline = rank_names(row_t, row_p, cls, edges) + timing_names(row_t, row_p)
    return [f'{scope}|{name}' for scope in scopes_of(row_t) for name in names + (headline if scope in HEADLINE else [])]


def confirmed_peaks_lock(row_t, row_p):
    """
    Peaks' lock, kept only once the tempogram's reading at that moment agrees within 4%. With a reading
    timeline this is causal; without one it falls back on the tempogram's final reading, which a listener
    would not yet have, and the report says so
    """
    if row_t.get('readings') is None:
        t = row_t['final']
        return next((bpm for _, bpm in row_p['stable'] if t is not None and within(bpm, t, TOLERANCE)), None)
    readings = [(h, b) for h, b, _ in row_t['readings']]
    return next((bpm for heard, bpm in row_p['stable']
                 if (t := stable_at(readings, heard)) is not None and within(bpm, t, TOLERANCE)), None)


def confidence_of(row):
    candidates = row.get('candidates')
    return candidates[0][1] if candidates else None


def bin_of(value, cut):
    """Index of `value` among the sorted cut points, so bins hold about the same number of tracks"""
    low, high = 0, len(cut)
    while low < high:
        middle = (low + high) // 2
        if cut[middle] < value:
            low = middle + 1
        else:
            high = middle
    return low


def rankers(row_t, row_p, cls, edges):
    """The scores ranked against being right: (name, the reading it vouches for, its level)"""
    t, p = row_t['final'], row_p['final']
    yield 'agreement for tempogram', t, AGREEMENT_LEVEL.get(cls)
    yield 'agreement for peaks', p, AGREEMENT_LEVEL.get(cls)
    yield 'agreement for combined', t if t is not None else p, AGREEMENT_LEVEL.get(cls)
    yield 'tempogram stable', t, 1 if row_t['stable'] else 0
    locks_agree = first_agreement(row_t['stable'], row_p['stable'], TOLERANCE) is not None
    yield 'lock agreement for tempogram', t, 2 if locks_agree else (1 if row_t['stable'] else 0)
    yield 'peaks stable', p, 1 if row_p['stable'] else 0
    if edges is not None:
        ct, cp = confidence_of(row_t), confidence_of(row_p)
        yield 'tempogram confidence', t, None if ct is None else bin_of(ct, edges['t'])
        yield 'peaks confidence', p, None if cp is None else bin_of(cp, edges['p'])
        # Agreement first, the engine's own confidence within a class
        if ct is not None:
            yield 'agreement then tempogram confidence', t, AGREEMENT_LEVEL.get(cls) * (CONFIDENCE_BINS + 1) + bin_of(ct, edges['t'])


def confidence_edges(rows_t, rows_p):
    """Quantile cut points of each engine's final confidence, or None in files that hold none"""
    def cut(rows):
        values = sorted(c for c in (confidence_of(r) for r in rows) if c is not None)
        if not values:
            return None
        return sorted({values[min(len(values) - 1, (i * len(values)) // CONFIDENCE_BINS)] for i in range(1, CONFIDENCE_BINS)})
    t, p = cut(rows_t), cut(rows_p)
    return None if t is None or p is None else {'t': t, 'p': p}


def pack(rows_t, rows_p):
    """One big integer per group, a FIELD_BITS-wide counter per key, so a resample sums in C"""
    edges = confidence_edges(rows_t, rows_p)
    index = {}
    groups = defaultdict(lambda: [0])
    for row_t, row_p in zip(rows_t, rows_p):
        assert (row_t['set'], row_t['id']) == (row_p['set'], row_p['id']), 'the engines ran different tracks'
        assert row_t.get('group') is not None, f"{row_t['set']}/{row_t['id']} has no group"
        cell = groups[(row_t['set'], row_t['group'])]
        for key in track_keys(row_t, row_p, edges):
            at = index.setdefault(key, len(index))
            cell[0] += 1 << (FIELD_BITS * at)
    strata = defaultdict(list)
    for (stratum, _), cell in groups.items():
        strata[stratum].append(cell[0])
    return index, [strata[name] for name in sorted(strata)], edges


def unpack(total, size):
    counts = array('I')
    counts.frombytes(total.to_bytes(size * FIELD_BITS // 8, 'little'))
    assert sys.byteorder == 'little' and counts.itemsize * 8 == FIELD_BITS
    return counts


def resample(strata, size):
    """The full tally, then REPLICATES resampled tallies"""
    rng = random.Random(SEED)
    full = unpack(sum(sum(s) for s in strata), size)
    draws = []
    for _ in range(REPLICATES):
        total = 0
        for stratum in strata:
            total += sum(rng.choices(stratum, k=len(stratum)))
        draws.append(unpack(total, size))
    return full, draws


class Tally:
    def __init__(self, index, full, draws):
        self.index, self.full, self.draws = index, full, draws

    def get(self, counts, key):
        at = self.index.get(key)
        return 0 if at is None else counts[at]

    def measure(self, statistic):
        """statistic(get) -> number or None, on the full tally and on each draw"""
        value = statistic(lambda key: self.get(self.full, key))
        if value is None:
            return None
        values = sorted(v for v in (statistic(lambda key, c=c: self.get(c, key)) for c in self.draws) if v is not None)
        at = lambda share: values[min(len(values) - 1, int(len(values) * share))]
        return value, at(0.025), at(0.975)


def ratio(numerator, denominator):
    return lambda get: None if get(denominator) == 0 else 100 * get(numerator) / get(denominator)


def auroc(get, name, scope, levels):
    """P(a right reading outranks a wrong one), ties counted half"""
    pos = [get(f'{scope}|rank|{name}|{level}|pos') for level in levels]
    neg = [get(f'{scope}|rank|{name}|{level}|neg') for level in levels]
    total_pos, total_neg = sum(pos), sum(neg)
    if total_pos == 0 or total_neg == 0:
        return None
    below, wins = 0, 0.0
    for p, n in zip(pos, neg):
        wins += p * (below + n / 2)
        below += n
    return wins / (total_pos * total_neg)


def fmt(interval, signed=False):
    if interval is None:
        return 'n/a'
    value, low, high = interval
    f = '{:+.1f}' if signed else '{:.1f}'
    return f'{f.format(value)} [{f.format(low)}, {f.format(high)}]'


def fmt3(interval):
    return 'n/a' if interval is None else '{:.3f} [{:.3f}, {:.3f}]'.format(*interval)


def split_half_tie_break(rows_t, rows_p):
    """
    The overfitting check of Q4: pick the best rule on one half of the groups and score it on the
    other, both ways round. Halves by a hash of the group, so an artist never sits on both
    """
    rules = ('tempogram', 'peaks', 'faster', 'slower')
    wins = {0: defaultdict(int), 1: defaultdict(int)}
    n = {0: 0, 1: 0}
    for row_t, row_p in zip(rows_t, rows_p):
        t, p = row_t['final'], row_p['final']
        if agreement(t, p) != 'octave':
            continue
        half = int.from_bytes(f"{row_t['set']}/{row_t['group']}".encode(), 'little') % 7919 % 2
        n[half] += 1
        for rule, pick in zip(rules, (t, p, max(t, p), min(t, p))):
            wins[half][rule] += is_correct(pick, row_t['truth'])
    lines = []
    for fit, score in ((0, 1), (1, 0)):
        best = max(rules, key=lambda r: wins[fit][r])
        lines.append(f'- Picked on half {fit} ({n[fit]} tracks): `{best}`, right on {wins[fit][best]}. '
                     f'On half {score} ({n[score]} tracks) it is right on {wins[score][best]}, '
                     f'against {wins[score]["tempogram"]} for always taking the tempogram')
    return lines


def report(path):
    with open(path) as file:
        data = json.load(file)
    if data.get('split') != 'dev':
        sys.exit(f'{path} is not a dev file: refused')
    rows_t, rows_p = data['results']['tempogram'], data['results']['peaks']
    index, strata, edges = pack(rows_t, rows_p)
    full, draws = resample(strata, len(index))
    tally = Tally(index, full, draws)
    has_readings = rows_t[0].get('readings') is not None
    out = []
    say = out.append

    say(f'Tracks: {len(rows_t)} per engine, {sum(len(s) for s in strata)} groups. '
        f'Ranges: 95% percentile, {REPLICATES} draws resampling groups within each set. '
        f'Confidence values {"present" if edges else "absent"}, reading timeline {"present" if has_readings else "absent"}.\n')

    scopes = ['all dev', 'free mixes, strict', 'free mixes, contested', 'fsld + groove + guitarset']
    for tier in ('strict', 'contested', 'both tiers'):
        scopes += [f'{band}, free mixes, {tier}' for band, _ in BANDS]

    scopes = ['all dev', 'free mixes, strict', 'free mixes, contested', 'fsld + groove + guitarset']
    for tier in ('strict', 'contested', 'both tiers'):
        scopes += [f'{band}, free mixes, {tier}' for band, _ in BANDS]
    c = (tally, full, scopes, edges, has_readings, rows_t, rows_p, out)
    for section in SECTIONS:
        section(c, say)
    print('\n'.join(out))


def section_agreement_shares(c, say):
    """One section of the report, written through `say`"""
    tally, full, scopes, edges, has_readings, rows_t, rows_p, out = c
    say('## Q1. How often the two final readings agree\n')
    say('Share of tracks, % [95% range]. `within 2%` and `within 4%` are cumulative; `half or double` is a ratio of 2 within 2%.\n')
    say('| scope | tracks | within 2% | within 4% | half or double | other disagreement | tempogram only | peaks only | neither |')
    say('|---|---:|---:|---:|---:|---:|---:|---:|---:|')
    for scope in scopes:
        n = tally.get(full, f'{scope}|n')
        if n == 0:
            continue
        c = lambda cls: f'{scope}|class|{cls}'
        cells = [
            tally.measure(ratio(c('agree2'), f'{scope}|n')),
            tally.measure(lambda g: 100 * (g(c('agree2')) + g(c('agree2to4'))) / g(f'{scope}|n') if g(f'{scope}|n') else None),
            *[tally.measure(ratio(c(cls), f'{scope}|n')) for cls in ('octave', 'other', 'tempogram only', 'peaks only', 'neither')],
        ]
        say(f'| {scope} | {n} | ' + ' | '.join(fmt(x) for x in cells) + ' |')

    say('\nThe `other` disagreements, by the ratio of tempogram over peaks (all dev):\n')
    say('| ratio | tracks |')
    say('|---|---:|')
    for name, _ in RELATIONS + (('none simple', 0),):
        say(f'| {name} | {tally.get(full, f"all dev|relation|{name}")} |')


def section_reliability(c, say):
    """One section of the report, written through `say`"""
    tally, full, scopes, edges, has_readings, rows_t, rows_p, out = c
    say('\n## Q2. Accuracy by agreement class: the reliability table\n')
    say('Acc1 (4%) and Acc2 of each engine within each class, % [95% range]. Tracks are those of the class.\n')
    for scope in scopes[:4]:
        say(f'\n**{scope}**\n')
        say('| class | tracks | tempogram Acc1 | tempogram Acc2 | peaks Acc1 | peaks Acc2 |')
        say('|---|---:|---:|---:|---:|---:|')
        for cls in CLASSES:
            n = tally.get(full, f'{scope}|class|{cls}')
            if n == 0:
                continue
            cells = [tally.measure(ratio(f'{scope}|{e}|{m}|{cls}', f'{scope}|class|{cls}')) for e in ('t', 'p') for m in ('acc1', 'acc2')]
            say(f'| {cls} | {n} | ' + ' | '.join(fmt(x) for x in cells) + ' |')
    say('\nPer band, tempogram Acc1 when the engines agree within 4% and when they do not (both read), free mixes, both tiers:\n')
    say('| band | agree tracks | Acc1 when agreeing | disagree tracks | Acc1 when disagreeing |')
    say('|---|---:|---:|---:|---:|')
    for band, _ in BANDS:
        scope = f'{band}, free mixes, both tiers'
        agree = (f'{scope}|class|agree2', f'{scope}|class|agree2to4')
        dis = (f'{scope}|class|octave', f'{scope}|class|other')
        acc = lambda keys: lambda g: (100 * sum(g(k.replace('|class|', '|t|acc1|')) for k in keys) / sum(g(k) for k in keys)) if sum(g(k) for k in keys) else None
        say(f'| {band} | {sum(tally.get(full, k) for k in agree)} | {fmt(tally.measure(acc(agree)))} | '
            f'{sum(tally.get(full, k) for k in dis)} | {fmt(tally.measure(acc(dis)))} |')


def section_ranking(c, say):
    """One section of the report, written through `say`"""
    tally, full, scopes, edges, has_readings, rows_t, rows_p, out = c
    say('\n## Q2 and Q6. How well each signal ranks right readings above wrong ones\n')
    say('AUROC [95% range]: the chance a right reading (Acc1) scores above a wrong one, ties counted half. 0.5 is no information.'
        ' Each signal is scored against the reading it vouches for, on the tracks where that reading exists.'
        ' `agreement` is ordinal: within 2%, within 4%, half or double, other, one engine alone.'
        ' `stable` is whether the engine ever sent bpmStable. Confidence is the final top candidate\'s, in'
        f' {CONFIDENCE_BINS} quantile bins.\n')
    rankers_named = [('agreement for tempogram', range(5)), ('agreement for peaks', range(5)), ('agreement for combined', range(5)),
                     ('tempogram stable', range(2)), ('lock agreement for tempogram', range(3)), ('peaks stable', range(2))]
    if edges:
        rankers_named += [('tempogram confidence', range(CONFIDENCE_BINS + 1)), ('peaks confidence', range(CONFIDENCE_BINS + 1)),
                          ('agreement then tempogram confidence', range(5 * (CONFIDENCE_BINS + 1)))]
    say('| signal | ' + ' | '.join(scopes[:4]) + ' |')
    say('|---|' + '---:|' * 4)
    for name, levels in rankers_named:
        cells = [fmt3(tally.measure(lambda g, s=s: auroc(g, name, s, levels))) for s in scopes[:4]]
        say(f'| {name} | ' + ' | '.join(cells) + ' |')
    say('\nTempogram AUROC gain of agreement over its own signal, paired (all dev):\n')
    pairs = [('agreement for tempogram', range(5), 'tempogram stable', range(2)),
             ('lock agreement for tempogram', range(3), 'tempogram stable', range(2))]
    if edges:
        pairs += [('agreement for tempogram', range(5), 'tempogram confidence', range(CONFIDENCE_BINS + 1)),
                  ('agreement then tempogram confidence', range(5 * (CONFIDENCE_BINS + 1)), 'tempogram confidence', range(CONFIDENCE_BINS + 1))]
    if edges:
        pairs += [('agreement for peaks', range(5), 'peaks confidence', range(CONFIDENCE_BINS + 1))]
    for a, la, b, lb in pairs:
        diff = tally.measure(lambda g: (lambda x, y: None if x is None or y is None else x - y)(auroc(g, a, 'all dev', la), auroc(g, b, 'all dev', lb)))
        say(f'- {a} less {b}: {fmt3(diff) if diff else "n/a"}')
    if edges:
        say('\nReliability of each engine\'s own final confidence, in fifths of its dev distribution (all dev): Acc1 of the'
            ' engine\'s final reading, % [95% range]. This is the raw scale RBA-106 would calibrate.\n')
        say('| engine | fifth | confidence from | to | tracks | Acc1 |')
        say('|---|---:|---:|---:|---:|---:|')
        per_fifth = CONFIDENCE_BINS // 5
        for engine, name in (('t', 'tempogram'), ('p', 'peaks')):
            cut = edges[engine]
            if len(cut) != CONFIDENCE_BINS - 1:
                say(f'| {name} | ties merge its bins ({len(cut)} distinct cut points): fifths not shown | | | | |')
                continue
            for fifth in range(5):
                levels = range(fifth * per_fifth, (fifth + 1) * per_fifth)
                key = lambda level, o: f'all dev|rank|{name} confidence|{level}|{o}'
                pos = lambda g, levels=levels: sum(g(key(l, 'pos')) for l in levels)
                tot = lambda g, levels=levels: sum(g(key(l, 'pos')) + g(key(l, 'neg')) for l in levels)
                low = 'n/a' if fifth == 0 else f'{cut[fifth * per_fifth - 1]:.3f}'
                high = 'n/a' if fifth == 4 else f'{cut[(fifth + 1) * per_fifth - 1]:.3f}'
                acc = tally.measure(lambda g, pos=pos, tot=tot: None if tot(g) == 0 else 100 * pos(g) / tot(g))
                say(f'| {name} | {fifth + 1} | {low} | {high} | {tot(lambda k: tally.get(full, k))} | {fmt(acc)} |')


def section_fallback(c, say):
    """One section of the report, written through `say`"""
    tally, full, scopes, edges, has_readings, rows_t, rows_p, out = c
    say('\n## Q3. Peaks as the fallback when the tempogram does not lock\n')
    say('The reports\' coverage is the share of tracks with a bpmStable lock. Here a track\'s lock is its first bpmStable,'
        ' and the combined lock is the tempogram\'s, else peaks\'. Acc1 of a lock is over all tracks of the scope, so'
        ' it counts a track with no lock as wrong. % [95% range]; differences are paired.\n')
    say('| scope | tracks | peaks locks, tempogram not | peaks lock right there | tempogram final right there | coverage tempogram | coverage combined | lock Acc1 tempogram | lock Acc1 combined | combined less tempogram | lock Acc2 tempogram | lock Acc2 combined |')
    say('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
    for scope in scopes[:4] + [f'{band}, free mixes, {tier}' for tier in ('strict', 'contested') for band, _ in BANDS]:
        n = tally.get(full, f'{scope}|n')
        if n == 0:
            continue
        only = f'{scope}|lock-class|peaks lock only'
        diff = tally.measure(lambda g: None if g(f'{scope}|n') == 0 else 100 * (g(f'{scope}|c-lock|acc1') - g(f'{scope}|t-lock|acc1')) / g(f'{scope}|n'))
        cells = [
            str(n), str(tally.get(full, only)),
            fmt(tally.measure(ratio(f'{scope}|p-lock|acc1|peaks lock only', only))),
            fmt(tally.measure(ratio(f'{scope}|t|acc1|lock peaks lock only', only))),
            fmt(tally.measure(ratio(f'{scope}|t-lock|read', f'{scope}|n'))),
            fmt(tally.measure(ratio(f'{scope}|c-lock|read', f'{scope}|n'))),
            fmt(tally.measure(ratio(f'{scope}|t-lock|acc1', f'{scope}|n'))),
            fmt(tally.measure(ratio(f'{scope}|c-lock|acc1', f'{scope}|n'))),
            fmt(diff, signed=True),
            fmt(tally.measure(ratio(f'{scope}|t-lock|acc2', f'{scope}|n'))),
            fmt(tally.measure(ratio(f'{scope}|c-lock|acc2', f'{scope}|n'))),
        ]
        say(f'| {scope} | ' + ' | '.join(cells) + ' |')
    say('\nThe shown lock, three ways: the tempogram alone; `combined`, with peaks\' lock where the tempogram has none; and'
        ' `confirmed`, with peaks\' lock only once the tempogram\'s reading at that moment agrees within 4%'
        f' ({"causal, from the reading timeline" if has_readings else "NOT causal in this file: it compares with the tempogram final reading"}).'
        ' Coverage, then the right share among locked tracks, % [95% range]:\n')
    say('| scope | coverage tempogram | coverage combined | coverage confirmed | right when locked, tempogram | combined | confirmed | right when locked, confirmed less tempogram | lock Acc1 over all tracks, confirmed less tempogram |')
    say('|---|---:|---:|---:|---:|---:|---:|---:|---:|')
    for scope in scopes[:4]:
        n = f'{scope}|n'
        diff = tally.measure(lambda g: None if g(n) == 0 else 100 * (g(f'{scope}|k-lock|acc1') - g(f'{scope}|t-lock|acc1')) / g(n))
        cells = [fmt(tally.measure(ratio(f'{scope}|{e}-lock|read', n))) for e in ('t', 'c', 'k')]
        cells += [fmt(tally.measure(ratio(f'{scope}|{e}-lock|acc1', f'{scope}|{e}-lock|read'))) for e in ('t', 'c', 'k')]
        share = lambda g, e: 100 * g(f'{scope}|{e}-lock|acc1') / g(f'{scope}|{e}-lock|read') if g(f'{scope}|{e}-lock|read') else None
        cells.append(fmt(tally.measure(lambda g: None if share(g, 'k') is None or share(g, 't') is None else share(g, 'k') - share(g, 't')), signed=True))
        say(f'| {scope} | ' + ' | '.join(cells) + f' | {fmt(diff, signed=True)} |')
    say('\nFor contrast, any final reading (not only a lock): `combined` reads the tempogram, and peaks when the tempogram has nothing.\n')
    say('| scope | peaks Acc1 where only peaks reads | tracks | coverage tempogram | coverage combined | Acc1 tempogram | Acc1 combined | combined less tempogram, Acc1 | Acc2 tempogram | Acc2 combined |')
    say('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
    for scope in scopes[:4] + [f'{band}, free mixes, both tiers' for band, _ in BANDS]:
        n = tally.get(full, f'{scope}|n')
        if n == 0:
            continue
        diff = tally.measure(lambda g: None if g(f'{scope}|n') == 0 else 100 * (g(f'{scope}|c|acc1') - g(f'{scope}|t|acc1')) / g(f'{scope}|n'))
        cells = [
            fmt(tally.measure(ratio(f'{scope}|p|acc1|peaks only', f'{scope}|class|peaks only'))),
            str(tally.get(full, f'{scope}|class|peaks only')),
            fmt(tally.measure(ratio(f'{scope}|t|read', f'{scope}|n'))),
            fmt(tally.measure(ratio(f'{scope}|c|read', f'{scope}|n'))),
            fmt(tally.measure(ratio(f'{scope}|t|acc1', f'{scope}|n'))),
            fmt(tally.measure(ratio(f'{scope}|c|acc1', f'{scope}|n'))),
            fmt(diff, signed=True),
            fmt(tally.measure(ratio(f'{scope}|t|acc2', f'{scope}|n'))),
            fmt(tally.measure(ratio(f'{scope}|c|acc2', f'{scope}|n'))),
        ]
        say(f'| {scope} | ' + ' | '.join(cells) + ' |')


def section_tie_break(c, say):
    """One section of the report, written through `say`"""
    tally, full, scopes, edges, has_readings, rows_t, rows_p, out = c
    say('\n## Q4. Tie-break inside a half or double disagreement\n')
    say('Share of those tracks each rule gets right (Acc1), % [95% range].\n')
    say('| scope | tracks | tempogram | peaks | faster | slower | the locked engine |')
    say('|---|---:|---:|---:|---:|---:|---:|')
    for scope in scopes[:4]:
        n = tally.get(full, f'{scope}|class|octave')
        if n == 0:
            continue
        cells = [fmt(tally.measure(ratio(f'{scope}|tie|{rule}', f'{scope}|class|octave'))) for rule in ('tempogram', 'peaks', 'faster', 'slower', 'locked')]
        say(f'| {scope} | {n} | ' + ' | '.join(cells) + ' |')
    say('\nSplit-half check, all dev:\n')
    out.extend(split_half_tie_break(rows_t, rows_p))


def section_timing_section(c, say):
    """One section of the report, written through `say`"""
    tally, full, scopes, edges, has_readings, rows_t, rows_p, out = c
    say('\n## Q5. When the engines first agree\n')
    say('From each engine\'s bpmStable timeline: the first moment both are locked within 4% of each other. % [95% range].\n')
    say('| scope | tempogram first lock right | tracks with a tempogram lock | tracks where the locks ever agree | first agreement right | tempogram first lock right, same tracks | agreement less first lock, same tracks | agreement comes after the tempogram\'s first lock |')
    say('|---|---:|---:|---:|---:|---:|---:|---:|')
    for scope in scopes[:4]:
        cells = [
            fmt(tally.measure(ratio(f'{scope}|lock|t|acc1', f'{scope}|lock|t'))),
            str(tally.get(full, f'{scope}|lock|t')),
            fmt(tally.measure(ratio(f'{scope}|agree-lock', f'{scope}|n'))),
            fmt(tally.measure(ratio(f'{scope}|agree-lock|acc1', f'{scope}|agree-lock'))),
            fmt(tally.measure(ratio(f'{scope}|agree-lock|t-first-acc1', f'{scope}|agree-lock'))),
            fmt(tally.measure(lambda g, a=f'{scope}|agree-lock': None if g(a) == 0 else 100 * (g(f'{a}|acc1') - g(f'{a}|t-first-acc1')) / g(a)), signed=True),
            fmt(tally.measure(ratio(f'{scope}|agree-lock|after-t', f'{scope}|agree-lock'))),
        ]
        say(f'| {scope} | ' + ' | '.join(cells) + ' |')
    times = timing(rows_t, rows_p, has_readings)
    say('')
    out.extend(times)
    if has_readings:
        say('\nFrom the reading timelines (every change of each engine\'s top candidate), the first moment both read within 2%:\n')
        say('| scope | tracks where readings ever agree | first agreement right |')
        say('|---|---:|---:|')
        for scope in scopes[:4]:
            say(f'| {scope} | {fmt(tally.measure(ratio(f"{scope}|agree-reading", f"{scope}|n")))} | '
                f'{fmt(tally.measure(ratio(f"{scope}|agree-reading|acc1", f"{scope}|agree-reading")))} |')


SECTIONS = (section_agreement_shares, section_reliability, section_ranking, section_fallback, section_tie_break, section_timing_section)


def median(values):
    values = sorted(values)
    if not values:
        return None
    middle = (len(values) - 1) / 2
    return (values[math.floor(middle)] + values[math.ceil(middle)]) / 2


def timing(rows_t, rows_p, has_readings):
    """Median seconds to the first tempogram lock and to the first agreement, all dev, no range"""
    lock, agree, reading_t, reading_agree = [], [], [], []
    for row_t, row_p in zip(rows_t, rows_p):
        if row_t['stable']:
            lock.append(row_t['stable'][0][0])
        agreed = first_agreement(row_t['stable'], row_p['stable'], TOLERANCE)
        if agreed:
            agree.append(agreed[0])
        if row_t['firstReadingAt'] is not None:
            reading_t.append(row_t['firstReadingAt'])
        if has_readings:
            seen = first_agreement([(h, b) for h, b, _ in row_t['readings']], [(h, b) for h, b, _ in row_p['readings']], 0.02)
            if seen:
                reading_agree.append(seen[0])
    lines = [f'Median seconds, all dev, over the tracks where it happens: tempogram first reading {median(reading_t):.1f} s, '
             f'tempogram first lock {median(lock):.1f} s, first agreement of the locks {median(agree):.1f} s.']
    if reading_agree:
        lines.append(f'First agreement of the readings within 2%: {median(reading_agree):.1f} s.')
    return lines


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('usage: python3 -I ensemble.py <dev.json>')
    report(sys.argv[1])
