"""Calibrate each engine's `confidence` on dev, so that it reads as the chance the reading is right.

Reads the calibration samples the hysteresis sweep keeps on the data volume
(`_job/calibration-samples-<commit>.json`, written by benchmark/hysteresis.ts): per dev track, under the
picked hysteresis, the reading last shown at 10, 15, 20, 30 and 45 s and at the end, the status there, and
the offline reading. Each reading is [bpm, confidence, raw] (`format` 2): the fit reads the raw score,
since the confidence is already calibrated. It refuses any file whose `split` is not `dev`, except in the
held-out mode, and never opens anything else.

    python3 -I benchmark/calibration.py <samples.json> <report.json>
    python3 -I benchmark/calibration.py --legacy-raw <samples.json> <report.json>
    python3 -I benchmark/calibration.py refit <dev samples.json> <committed results.json> <out.json>
    python3 -I benchmark/calibration.py heldout <held-out samples.json> <committed results.json> <verdict.md> <verdict.json>

The first prints aggregates as markdown and writes the fitted tables, aggregates only, to <report.json>.
`--legacy-raw` reads a file written before the raw score was recorded, whose readings are [bpm, confidence]: only for an image older
than e70a4f5, when that confidence was still the raw score, as sha-0063495's was. `refit` fits dev again and exits 0
only when the tables equal the committed ones exactly and every recorded confidence is the committed table read at
the recorded raw score. `heldout` is the calibration study's one held-out check (decided on 2026-11-05): the committed tempogram
mapping on every held-out realtime reading at the shipped HYSTERESIS, judged against HELDOUT_BAR, exit 0 pass and
1 fail. Both write aggregates only, and exit 2, writing no verdict, when they refuse their input or break.

Every rule below is fixed before the samples exist:
- A reading counts when it was shown (status settling or locked). It is right at 4% (Acc1); a reading
  right only at 2x, 3x, 1/2 or 1/3 is an octave error, counted apart and wrong for the calibration.
- The mapping is monotone: the raw confidences of the fit part are cut in BINS bins of equal count, each
  bin's Acc1 is pooled by isotonic regression (pool adjacent violators, weighted by count), and the table is
  the bins' mean raw confidence and pooled Acc1, read by linear interpolation and held flat past its ends.
- Artists are split by a hash of set and group: a third is the check part, the rest the fit part. The
  check part scores the fit part's table. The table shipped is refitted on all dev.
- Ranges are 95% percentile ranges from REPLICATES draws resampling artists within each set, as
  lib/pass-bar.ts does. The fitted table is held fixed, so they leave out the noise of the fit.
- A tempo band gets its own table only if, on the check part, a band's mean residual (Acc1 less mean mapped
  confidence) has a range that excludes zero. The band is the reading's own tempo, known when it is emitted.
  Its table is built the same way from that band's readings: fitted on the fit part and graded on the check
  part, then refitted on all dev. Other bands read the table of all readings.
- The offline path gets its own table only if, on the check part, the realtime table's ECE on offline
  readings is above the offline table's beyond the noise (the paired difference's range above zero).
- "Adds nothing": on all dev, readings ranked by raw confidence and cut in halves of equal count, the top
  half's Acc1 less the bottom half's. Confidence ships only when that difference's range is above zero.
"""

import hashlib
import json
import random
import sys
import traceback

TOLERANCE = 0.04
ACC2_FACTORS = (2, 3, 1 / 2, 1 / 3)
BINS = 20
ECE_BINS = 10
REPLICATES = 1000
SEED = 'rba-106-calibration'
CHECK_SHARE = 3  # one artist in three
BANDS = (('under 90', 0, 90), ('90-140', 90, 140), ('140-165', 140, 165), ('165 and over', 165, float('inf')))
TIMES = ('10 s', '15 s', '20 s', '30 s', '45 s')

# The one held-out check this proposes, fixed before it may run: on the tempogram's realtime readings, with
# the shipped table, all must hold. It needs its own decision and is not run by this file.
HELDOUT_BAR = {'ece_max': 0.05, 'ece_high_max': 0.08, 'brier_not_worse': True, 'top_half_low_min': 0.0}
# The row the held-out check judges at: the shipped HYSTERESIS, as the approved check says. The table was fitted at the
# sweep's pick, pulseLostAfterSeconds 3, which only the dev re-fit uses. tests/unit/benchmark/calibration-samples.test.ts
# holds this line to the library's HYSTERESIS.
HELDOUT_HYSTERESIS = {"lockBand": 0.02, "lockAfterSeconds": 8, "unlockBand": 0.04, "unlockAfterSeconds": 2, "pulseLostAfterSeconds": 2}

# The samples' format since the harness records the raw score: readings as [bpm, confidence, raw]
SAMPLES_FORMAT = 2
# How far a recorded confidence may sit from the committed table read at its recorded raw score: the tempogram's
# trace keeps both to six decimals, and the steepest segment of any table rises about 15 per unit of raw score, so
# the two roundings stay under 8e-6
SHOWN_TOLERANCE = 1e-5


def is_correct(reading, truth):
    return abs(reading - truth) <= TOLERANCE * truth


def is_octave(reading, truth):
    return not is_correct(reading, truth) and any(is_correct(reading, truth * f) for f in ACC2_FACTORS)


def is_check(track):
    digest = hashlib.sha256(f"{track['set']}/{track['group']}".encode()).digest()
    return digest[0] % CHECK_SHARE == 0


def scored(reading, legacy=False):
    """(bpm, raw score, recorded confidence) of a recorded reading: [bpm, confidence, raw], or, in a file from
    before the raw score was recorded, [bpm, raw] with no calibrated confidence beside it"""
    if legacy:
        assert len(reading) == 2, reading
        return reading[0], reading[1], None
    assert len(reading) == 3, reading
    return reading[0], reading[2], reading[1]


def readings_of(track, legacy=False):
    """The shown readings at the sample times and the end, as dicts, then the offline reading"""
    out = []
    cluster = (track['set'], track['group'])
    times = [t for i, t in enumerate(TIMES) if i < len(track['readings']) - 1] + ['end']
    for time, status, reading in zip(times, track['statuses'], track['readings']):
        if status != '0' and reading is not None:
            bpm, raw, shown = scored(reading, legacy)
            out.append(sample((bpm, raw), track['truth'], cluster, time, 'realtime', shown))
    if track.get('offline') is not None:
        bpm, raw, shown = scored(track['offline'], legacy)
        out.append(sample((bpm, raw), track['truth'], cluster, 'offline', 'offline', shown))
    return out


def sample(reading, truth, cluster, time, path, shown=None):
    """One reading as the fit reads it: `reading` is (bpm, raw score), `shown` the calibrated confidence recorded
    beside it, None in older files"""
    bpm, confidence = reading
    # The contract keeps confidence in 0..1, and the ECE bins and packed sums rely on it
    assert 0 <= confidence <= 1, (cluster, time, confidence)
    return {'bpm': bpm, 'raw': confidence, 'shown': shown, 'right': is_correct(bpm, truth), 'octave': is_octave(bpm, truth),
            'cluster': cluster, 'time': time, 'path': path}


def pav(values, weights):
    """Isotonic (non-decreasing) fit of values, weighted: pool adjacent violators"""
    blocks = []
    for value, weight in zip(values, weights):
        blocks.append([value * weight, weight, 1])
        while len(blocks) > 1 and blocks[-2][0] / blocks[-2][1] > blocks[-1][0] / blocks[-1][1]:
            total, w, n = blocks.pop()
            blocks[-1][0] += total
            blocks[-1][1] += w
            blocks[-1][2] += n
    fitted = []
    for total, weight, n in blocks:
        fitted.extend([total / weight] * n)
    return fitted


def fit_table(samples, bins=BINS):
    """[[raw, mapped], ...], raw increasing: the mapping described above"""
    ordered = sorted(samples, key=lambda s: s['raw'])
    if not ordered:
        return []
    cuts = [round(i * len(ordered) / bins) for i in range(bins + 1)]
    groups = [ordered[a:b] for a, b in zip(cuts, cuts[1:]) if b > a]
    merged = []
    for group in groups:
        x = sum(s['raw'] for s in group) / len(group)
        if merged and abs(merged[-1][0] - x) < 1e-12:
            merged[-1][1].extend(group)
        else:
            merged.append([x, list(group)])
    accuracy = [sum(s['right'] for s in g) / len(g) for _, g in merged]
    pooled = pav(accuracy, [len(g) for _, g in merged])
    return [[round(x, 6), round(y, 6)] for (x, _), y in zip(merged, pooled)]


def apply_table(table, raw):
    if not table:
        return raw
    if raw <= table[0][0]:
        return table[0][1]
    for (x0, y0), (x1, y1) in zip(table, table[1:]):
        if raw <= x1:
            return y0 + (y1 - y0) * (raw - x0) / (x1 - x0)
    return table[-1][1]


def as_mapping(table):
    """A mapping is {'all': table, 'bands': {band name: table}}: a band with its own table reads it, the rest
    read 'all'. A bare table is a mapping with no band table"""
    return table if isinstance(table, dict) else {'all': table, 'bands': {}}


def apply_mapping(mapping, raw, bpm):
    mapping = as_mapping(mapping)
    return apply_table(mapping['bands'].get(band_of(bpm), mapping['all']), raw)


def ece_bin(confidence):
    return min(ECE_BINS - 1, int(confidence * ECE_BINS))


# The bootstrap sums integer fields per artist, packed into one integer each, as ensemble.py does: Python adds
# big integers in C, which keeps 1000 draws over thousands of artists quick. Fractions are scaled by SCALE.
SCALE = 10 ** 6
FIELD_BITS = 64


class Tally:
    """Per artist sums of named fields, and every statistic on the data and on the same resampled draws"""

    def __init__(self, samples, fields_of):
        per_cluster = {}
        for s in samples:
            per_cluster.setdefault(s['cluster'], []).append(fields_of(s))
        names = sorted({name for rows in per_cluster.values() for row in rows for name in row})
        self.index = {name: i for i, name in enumerate(names)}
        packed = {}
        for cluster, rows in per_cluster.items():
            total = 0
            for row in rows:
                for name, value in row.items():
                    assert value >= 0 and value < 1 << (FIELD_BITS - 8), (name, value)
                    total += int(value) << (FIELD_BITS * self.index[name])
            packed[cluster] = total
        strata = {}
        for (set_name, group), total in packed.items():
            strata.setdefault(set_name, []).append(total)
        self.full = self.unpack(sum(packed.values()))
        rng = random.Random(SEED)
        ordered = [strata[name] for name in sorted(strata)]
        self.draws = [self.unpack(sum(sum(rng.choices(s, k=len(s))) for s in ordered)) for _ in range(REPLICATES)]

    def unpack(self, total):
        size = FIELD_BITS // 8
        raw = total.to_bytes(max(1, len(self.index)) * size, 'little')
        return [int.from_bytes(raw[i * size:(i + 1) * size], 'little') for i in range(len(self.index))]

    def get(self, counts, name):
        at = self.index.get(name)
        return 0 if at is None else counts[at]

    def measure(self, statistic):
        """statistic(get) -> number or None: (value, low, high), or None without data"""
        value = statistic(lambda name: self.get(self.full, name))
        if value is None:
            return None
        values = sorted(v for v in (statistic(lambda name, c=c: self.get(c, name)) for c in self.draws) if v is not None)
        at = lambda share: values[min(len(values) - 1, int(len(values) * share))]
        return value, at(0.025), at(0.975)


def ece_fields(prefix, confidence, right):
    b = ece_bin(confidence)
    return {f'{prefix}n{b}': 1, f'{prefix}r{b}': int(right), f'{prefix}c{b}': round(confidence * SCALE),
            f'{prefix}sq': round((confidence - right) ** 2 * SCALE), f'{prefix}n': 1}


def ece(prefix):
    def statistic(get):
        n = get(f'{prefix}n')
        if n == 0:
            return None
        return sum(abs(get(f'{prefix}r{b}') - get(f'{prefix}c{b}') / SCALE) for b in range(ECE_BINS)) / n
    return statistic


def brier(prefix):
    return lambda get: None if get(f'{prefix}n') == 0 else get(f'{prefix}sq') / SCALE / get(f'{prefix}n')


def difference(a, b):
    def statistic(get):
        x, y = a(get), b(get)
        return None if x is None or y is None else x - y
    return statistic


def band_of(bpm):
    return next(name for name, low, high in BANDS if low <= bpm < high)


def residual(name):
    """Acc1 less the mean mapped confidence, on readings carrying `name`"""
    return lambda get: None if get(f'{name}:n') == 0 else (get(f'{name}:r') - get(f'{name}:c') / SCALE) / get(f'{name}:n')


def check_fields(mapping):
    """What the check part sums per reading: ECE and Brier before and after, the reliability bins, octave
    errors, and each band's and each time's residual under the table"""
    def fields_of(s):
        mapped = apply_mapping(mapping, s['raw'], s['bpm'])
        out = {**ece_fields('before:', s['raw'], s['right']), **ece_fields('after:', mapped, s['right'])}
        out[f"after:o{ece_bin(mapped)}"] = int(s['octave'])
        out[f"before:o{ece_bin(s['raw'])}"] = int(s['octave'])
        for key in (f"band {band_of(s['bpm'])}", f"time {s['time']}"):
            out[f'{key}:n'] = 1
            out[f'{key}:r'] = int(s['right'])
            out[f'{key}:c'] = round(mapped * SCALE)
        return out
    return fields_of


def top_half(samples):
    """(value, low, high) of the top half's Acc1 less the bottom half's, readings ranked by raw confidence and
    cut in two halves of equal count, ties kept in file order"""
    ranked = sorted(range(len(samples)), key=lambda i: samples[i]['raw'])
    top = set(ranked[len(ranked) // 2:])
    marked = [{**s, 'top': i in top} for i, s in enumerate(samples)]
    half = lambda s: 'top' if s['top'] else 'bottom'
    return Tally(marked, lambda s: {f'{half(s)}:n': 1, f'{half(s)}:r': int(s['right'])}).measure(top_less_bottom)


def top_less_bottom(get):
    if get('top:n') == 0 or get('bottom:n') == 0:
        return None
    return get('top:r') / get('top:n') - get('bottom:r') / get('bottom:n')


def reliability(tally, prefix):
    rows = []
    for b in range(ECE_BINS):
        n = tally.get(tally.full, f'{prefix}n{b}')
        if n:
            rows.append({'bin': [b / ECE_BINS, (b + 1) / ECE_BINS], 'n': n,
                         'confidence': tally.get(tally.full, f'{prefix}c{b}') / SCALE / n,
                         'acc1': tally.get(tally.full, f'{prefix}r{b}') / n,
                         'octave': tally.get(tally.full, f'{prefix}o{b}') / n})
    return rows


def offline_check(fit, check, realtime_mapping):
    """The realtime table's ECE on offline readings less an offline table's, paired on the check part"""
    off_fit = [s for s in fit if s['path'] == 'offline']
    off_check = [s for s in check if s['path'] == 'offline']
    own = fit_table(off_fit)
    tally = Tally(off_check, lambda s: {**ece_fields('rt:', apply_mapping(realtime_mapping, s['raw'], s['bpm']), s['right']),
                                        **ece_fields('own:', apply_table(own, s['raw']), s['right'])})
    return {'readings': len(off_check), 'realtime table': tally.measure(ece('rt:')), 'own table': tally.measure(ece('own:')),
            'realtime less own': tally.measure(difference(ece('rt:'), ece('own:')))}


def check_block(mapping, readings):
    """ECE, Brier, reliability, band and time residuals of a mapping on realtime readings, with ranges"""
    tally = Tally(readings, check_fields(mapping))
    pair = lambda measure: {'before': tally.measure(measure('before:')), 'after': tally.measure(measure('after:')),
                            'after less before': tally.measure(difference(measure('after:'), measure('before:')))}
    return {
        'readings': len(readings),
        'ece': pair(ece), 'brier': pair(brier),
        'reliability': {'before': reliability(tally, 'before:'), 'after': reliability(tally, 'after:')},
        'bands': {name: tally.measure(residual(f'band {name}')) for name, _, _ in BANDS},
        'times': {time: tally.measure(residual(f'time {time}')) for time in (*TIMES, 'end')},
    }


def analyse(samples):
    """One engine's calibration report, from its dev readings"""
    on = lambda path, chosen: [s for s in chosen if s['path'] == path]
    fit = [s for s in samples if not s['check']]
    check = [s for s in samples if s['check']]
    table = fit_table(on('realtime', fit))
    block = check_block(table, on('realtime', check))
    needed = [name for name, r in block['bands'].items() if r is not None and (r[1] > 0 or r[2] < 0)]
    # The bands the rule gives a table are fitted on the fit part and graded on the check part, as the whole table is
    in_band = lambda name, chosen: [s for s in on('realtime', chosen) if band_of(s['bpm']) == name]
    mapping = {'all': table, 'bands': {name: fit_table(in_band(name, fit)) for name in needed}}
    banded = check_block(mapping, on('realtime', check)) if needed else None
    block['offline'] = offline_check(fit, check, mapping)
    separate = block['offline']['realtime less own'] is not None and block['offline']['realtime less own'][1] > 0
    halves = {path: top_half(on(path, samples)) for path in ('realtime', 'offline')}
    tables = {'realtime': {'all': fit_table(on('realtime', samples)), 'bands': {name: fit_table(in_band(name, samples)) for name in needed}}}
    if separate:
        tables['offline'] = fit_table(on('offline', samples))
    return {
        'readings': {'realtime': len(on('realtime', samples)), 'offline': len(on('offline', samples)),
                     'artists': len({s['cluster'] for s in samples}), 'check artists': len({s['cluster'] for s in check})},
        'fit table': table,
        'check': block,
        'band tables needed': needed,
        'check with band tables': banded,
        'separate offline table': separate,
        'top half less bottom half': halves,
        'adds something': halves['realtime'] is not None and halves['realtime'][1] > 0,
        'tables': tables,
    }


def heldout_report(mapping, samples):
    """The calibration study's held-out check, which its decision of 2026-11-05 allows once: the shipped mapping on every
    held-out realtime reading, in the shape `heldout_verdict` reads. Only the `heldout` mode calls it"""
    realtime = [s for s in samples if s['path'] == 'realtime']
    return {'check': check_block(mapping, realtime), 'top half less bottom half': {'realtime': top_half(realtime)}}


def heldout_verdict(report):
    """True when every part of HELDOUT_BAR holds on a `heldout_report`"""
    ece_after = report['check']['ece']['after']
    brier = report['check']['brier']
    halves = report['top half less bottom half']['realtime']
    return (ece_after is not None and ece_after[0] <= HELDOUT_BAR['ece_max'] and ece_after[2] <= HELDOUT_BAR['ece_high_max']
            and (not HELDOUT_BAR['brier_not_worse'] or brier['after'][0] <= brier['before'][0])
            and halves is not None and halves[1] > HELDOUT_BAR['top_half_low_min'])


def read_json(path):
    with open(path, encoding='utf-8') as file:
        return json.load(file)


def load_data(data, split='dev', legacy=False):
    """(hysteresis, {engine: readings}, the file's counts) of a samples file already parsed. Only `split` is read:
    held-out only when the held-out mode asks for it"""
    if data.get('split') != split:
        raise SystemExit(f"calibration reads {split} only here, not {data.get('split')}")
    if legacy and data.get('format') is not None:
        raise SystemExit(f"--legacy-raw is for files from before RBA-148, and this one has format {data['format']}")
    if not legacy and data.get('format') != SAMPLES_FORMAT:
        raise SystemExit(f"these samples have format {data.get('format')}, not {SAMPLES_FORMAT}: a file from before RBA-148 "
                         'holds the raw score only if its image predates e70a4f5, and then reads with --legacy-raw')
    out = {}
    for engine, tracks in data['samples'].items():
        out[engine] = []
        for track in tracks:
            check = is_check(track)
            out[engine].extend({**s, 'check': check} for s in readings_of(track, legacy))
    counts = {'tracks': data.get('tracks'), 'skipped': data.get('skipped')}
    return data['hysteresis'], out, counts


def load(path, split='dev', legacy=False):
    hysteresis, out, _ = load_data(read_json(path), split, legacy)
    return hysteresis, out


def shown_mismatches(mapping, samples):
    """How many readings carry a recorded confidence that is not `mapping` read at their recorded raw score"""
    return sum(1 for s in samples if s['shown'] is None or abs(apply_mapping(mapping, s['raw'], s['bpm']) - s['shown']) > SHOWN_TOLERANCE)


def shipped_mapping(committed, engine):
    """The mapping the library ships for `engine`, from the committed results: realtime and offline share it"""
    tables = committed['engines'][engine]['tables']
    assert set(tables) == {'realtime'}, f'{engine} has a separate offline table, which the library does not ship'
    return tables['realtime']


def refit(data, committed):
    """(passed, aggregates) of fitting dev again on recorded samples against the committed results"""
    hysteresis, samples, _ = load_data(data)
    engines = {}
    for engine, chosen in samples.items():
        result = analyse(chosen)
        expected = committed['engines'][engine]
        engines[engine] = {
            'readings': result['readings'],
            'committed readings': expected['readings'],
            'hysteresis as committed': hysteresis[engine] == committed['hysteresis'][engine],
            'tables equal': result['tables'] == expected['tables'],
            'shown mismatches': shown_mismatches(shipped_mapping(committed, engine), chosen),
            'tables': result['tables'],
        }
    passed = bool(engines) and all(e['readings'] == e['committed readings'] and e['hysteresis as committed'] and e['tables equal']
                                   and e['shown mismatches'] == 0 for e in engines.values())
    return passed, {'split': 'dev', 'passed': passed, 'python': sys.version, 'engines': engines}


def heldout_check(data, committed):
    """The verdict file of the calibration study's held-out check, aggregates only. Refuses before judging when the samples are
    not the tempogram's at the shipped row, or carry confidences the committed table does not give"""
    hysteresis, samples, counts = load_data(data, split='heldout')
    if set(samples) != {'tempogram'} or hysteresis['tempogram'] != HELDOUT_HYSTERESIS:
        raise SystemExit('the held-out check reads the tempogram at the shipped HYSTERESIS, and nothing else')
    mapping = shipped_mapping(committed, 'tempogram')
    chosen = samples['tempogram']
    mismatches = shown_mismatches(mapping, chosen)
    if mismatches:
        raise SystemExit(f'{mismatches} readings carry a confidence the committed table does not give: the image does not ship it')
    report = heldout_report(mapping, chosen)
    return {'split': 'heldout', 'engine': 'tempogram', 'hysteresis': hysteresis['tempogram'], 'bar': HELDOUT_BAR, 'python': sys.version,
            'passed': heldout_verdict(report), 'tracks': counts['tracks'], 'skipped': counts['skipped'],
            'artists': len({s['cluster'] for s in chosen}), **report}


def heldout_markdown(verdict):
    """The held-out check's result, aggregates only"""
    check = verdict['check']
    halves = verdict['top half less bottom half']['realtime']
    tracks = verdict['tracks'] or {}
    out = [f"## RBA-106 held-out calibration check: {'pass' if verdict['passed'] else 'fail'}\n",
           f"Tempogram realtime readings at `{json.dumps(verdict['hysteresis'], sort_keys=True)}`, the committed table. "
           f"Tracks: {', '.join(f'{name} {n}' for name, n in sorted(tracks.items())) or 'n/a'}, {verdict['skipped']} skipped. "
           f"Readings: {check['readings']}, from {verdict['artists']} artists. Ranges: 95% percentile, {REPLICATES} draws "
           'resampling artists within each set.\n',
           f"Bar (HELDOUT_BAR): ECE at most {HELDOUT_BAR['ece_max']}, its upper range at most {HELDOUT_BAR['ece_high_max']}, "
           f"Brier no worse than raw, and the top half less bottom half's low end above {HELDOUT_BAR['top_half_low_min']}.\n",
           '| | raw | shipped table | table less raw |', '|---|---|---|---|']
    for name in ('ece', 'brier'):
        row = check[name]
        out.append(f"| {'ECE' if name == 'ece' else 'Brier'} | {fmt(row['before'], 1, 3)} | {fmt(row['after'], 1, 3)} "
                   f"| {fmt(row['after less before'], 1, 3, True)} |")
    out.append(f'\nTop half less bottom half by raw score, Acc1 points: {fmt(halves, signed=True)}.\n')
    out.append('Reliability with the shipped table (confidence bin, readings, mean confidence, Acc1, octave errors):\n')
    out.extend(['| bin | n | confidence | Acc1 | octave |', '|---|---|---|---|---|'])
    for row in check['reliability']['after']:
        out.append(f"| {row['bin'][0]:.1f} to {row['bin'][1]:.1f} | {row['n']} | {100 * row['confidence']:.1f} "
                   f"| {100 * row['acc1']:.1f} | {100 * row['octave']:.1f} |")
    out.extend(['\n| scope | residual (Acc1 less mean confidence, points) |', '|---|---|'])
    out.extend(f'| band {name} | {fmt(value, signed=True)} |' for name, value in check['bands'].items())
    out.extend(f'| at {name} | {fmt(value, signed=True)} |' for name, value in check['times'].items())
    return '\n'.join(out) + '\n'


def write_json(path, value):
    with open(path, 'w', encoding='utf-8') as file:
        json.dump(value, file, indent=1)


def fmt(interval, scale=100, digits=1, signed=False):
    if interval is None:
        return 'n/a'
    f = ('{:+.%df}' if signed else '{:.%df}') % digits
    value, low, high = (x * scale for x in interval)
    return f'{f.format(value)} [{f.format(low)}, {f.format(high)}]'


def markdown(engine, hysteresis, result):
    """One engine's section of the results file: aggregates only"""
    out = []
    say = out.append
    counts = result['readings']
    check = result['check']
    say(f'## {engine}\n')
    say(f'Hysteresis: `{json.dumps(hysteresis, sort_keys=True)}`. Readings: {counts["realtime"]} realtime and '
        f'{counts["offline"]} offline, from {counts["artists"]} artists, {counts["check artists"]} of them in the check part.\n')
    say(f'On the check part ({check["readings"]} realtime readings), the fit part\'s table:\n')
    say('| | before | after | after less before |')
    say('|---|---|---|---|')
    for name, digits in (('ece', 3), ('brier', 3)):
        row = check[name]
        say(f'| {name.upper() if name == "ece" else "Brier"} | {fmt(row["before"], 1, digits)} | {fmt(row["after"], 1, digits)} '
            f'| {fmt(row["after less before"], 1, digits, True)} |')
    for when in ('before', 'after'):
        say(f'\nReliability {when}, check part (confidence bin, readings, mean confidence, Acc1, octave errors):\n')
        say('| bin | n | confidence | Acc1 | octave |')
        say('|---|---|---|---|---|')
        for row in check['reliability'][when]:
            say(f'| {row["bin"][0]:.1f} to {row["bin"][1]:.1f} | {row["n"]} | {100 * row["confidence"]:.1f} '
                f'| {100 * row["acc1"]:.1f} | {100 * row["octave"]:.1f} |')
    say('\nResidual after the table (Acc1 less mean mapped confidence, points), check part:\n')
    say('| scope | residual |')
    say('|---|---|')
    for name, value in check['bands'].items():
        say(f'| band {name} | {fmt(value, signed=True)} |')
    for name, value in check['times'].items():
        say(f'| at {name} | {fmt(value, signed=True)} |')
    offline = check['offline']
    say(f'\nOffline readings on the check part ({offline["readings"]}): ECE {fmt(offline["realtime table"], 1, 3)} with the '
        f'realtime table, {fmt(offline["own table"], 1, 3)} with their own, difference {fmt(offline["realtime less own"], 1, 3, True)}. '
        f'Separate offline table: {"yes" if result["separate offline table"] else "no"}. '
        f'Band tables needed: {", ".join(result["band tables needed"]) or "none"}.\n')
    banded = result['check with band tables']
    if banded is not None:
        say(f'With the band tables ({", ".join(result["band tables needed"])}) fitted on the fit part, on the check part:\n')
        say('| | before | after | after less before |')
        say('|---|---|---|---|')
        for name, digits in (('ece', 3), ('brier', 3)):
            row = banded[name]
            say(f'| {name.upper() if name == "ece" else "Brier"} | {fmt(row["before"], 1, digits)} | {fmt(row["after"], 1, digits)} '
                f'| {fmt(row["after less before"], 1, digits, True)} |')
        say('\n| scope | residual with band tables |')
        say('|---|---|')
        for name, value in banded['bands'].items():
            say(f'| band {name} | {fmt(value, signed=True)} |')
        for name, value in banded['times'].items():
            say(f'| at {name} | {fmt(value, signed=True)} |')
        say('')
    halves = result['top half less bottom half']
    say(f'"Adds nothing" bar, all dev: top half less bottom half by raw confidence, Acc1 points: realtime '
        f'{fmt(halves["realtime"], signed=True)}, offline {fmt(halves["offline"], signed=True)}. '
        f'Confidence {"adds something: it ships calibrated" if result["adds something"] else "adds nothing: drop it"}.\n')
    say('Table refitted on all dev (raw, calibrated):\n')
    for path, table in result['tables'].items():
        say(f'- {path}: `{json.dumps(table, sort_keys=True)}`')
    return '\n'.join(out)


USAGE = __doc__.split('\n\n')[2]


def judge(argv):
    """`refit` and `heldout`: 0 passed, 1 judged and not passed"""
    if argv[1] == 'refit':
        passed, report = refit(read_json(argv[2]), read_json(argv[3]))
        write_json(argv[4], report)
        for engine, result in report['engines'].items():
            print(f"{engine}: tables equal {result['tables equal']}, readings {result['readings']} against "
                  f"{result['committed readings']}, hysteresis as committed {result['hysteresis as committed']}, "
                  f"{result['shown mismatches']} confidences off the committed table")
        print(f"re-fit {'reproduces' if passed else 'does not reproduce'} the committed tables")
        return 0 if passed else 1
    verdict = heldout_check(read_json(argv[2]), read_json(argv[3]))
    markdown = heldout_markdown(verdict)
    write_json(argv[5], verdict)
    with open(argv[4], 'w', encoding='utf-8') as file:
        file.write(markdown)
    print(markdown)
    return 0 if verdict['passed'] else 1


def main(argv):
    """The exit code: 0 done or passed, 1 a re-fit or held-out check judged and not passed, 2 refused or broken"""
    if len(argv) > 1 and argv[1] in ('refit', 'heldout'):
        if len(argv) != {'refit': 5, 'heldout': 6}[argv[1]]:
            print(f'usage:\n{USAGE}', file=sys.stderr)
            return 2
        # A refusal or a crash must not read as a judged fail: the job records a verdict only for 0 and 1
        try:
            return judge(argv)
        except (Exception, SystemExit) as error:  # noqa: BLE001
            # The job's log leaves the volume. A refusal's text is this file's own and quotes counts only; any other
            # held-out error may quote a track or a reading, so only its kind and place are named. Dev may be quoted.
            if isinstance(error, SystemExit):
                print(f'{argv[1]} refused: {error}', file=sys.stderr)
            elif argv[1] == 'heldout':
                frame = traceback.extract_tb(error.__traceback__)[-1]
                print(f'heldout refused or broken: {type(error).__name__} at {frame.name}:{frame.lineno}', file=sys.stderr)
            else:
                traceback.print_exc()
            return 2
    legacy = len(argv) == 4 and argv[1] == '--legacy-raw'
    if len(argv) != 3 and not legacy:
        raise SystemExit(f'usage:\n{USAGE}')
    hysteresis, samples = load(argv[-2], legacy=legacy)
    results = {engine: analyse(chosen) for engine, chosen in samples.items()}
    write_json(argv[-1], {'split': 'dev', 'hysteresis': hysteresis, 'heldout bar': HELDOUT_BAR, 'engines': results})
    print(f'Ranges: 95% percentile, {REPLICATES} draws resampling artists within each set.\n')
    print('\n\n'.join(markdown(engine, hysteresis[engine], result) for engine, result in results.items()))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
