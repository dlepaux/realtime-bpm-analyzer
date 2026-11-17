"""RBA-106: the hysteresis sweep's trade-off tables, as markdown, from the job's aggregate report.

    python3 -I benchmark/hysteresis_table.py <hysteresis-report-<sha>.json>

The report (`_job/hysteresis-report-<sha>.json`, written by benchmark/hysteresis.ts) holds aggregates only:
every grid row's metrics with 95% ranges and its paired difference with the contract's row. This prints, per
engine, the contract's row, the best and the pick, then each field's axis with the other fields at the pick,
so the trade-off around the pick is visible and its bracketing can be read off.
"""

import json
import sys

FIELDS = ('lockBand', 'lockAfterSeconds', 'unlockBand', 'unlockAfterSeconds', 'pulseLostAfterSeconds')
SHORT = {'lockBand': 'lock band', 'lockAfterSeconds': 'lock after s', 'unlockBand': 'unlock band',
         'unlockAfterSeconds': 'unlock after s', 'pulseLostAfterSeconds': 'pulse lost after s'}
# Shares in percent, rates per minute, times in seconds
COLUMNS = (('coverage', 'lock coverage %', 100, 1), ('rightWhenLocked', 'right when locked %', 100, 1),
           ('falseLocked', 'false-locked % of locked time', 100, 1), ('flapping', 'flapping /min (steady)', 1, 3),
           ('lockLoss', 'lock to listening /min (steady)', 1, 3), ('medianFirstLock', 'first lock median s', 1, 1),
           ('p90FirstLock', 'first lock p90 s', 1, 1))


def fmt(interval, scale, digits, signed=False):
    # JSON writes a NaN (no first lock in a draw) as null
    if interval is None or interval[0] is None:
        return 'n/a'
    f = ('{:+.%df}' if signed else '{:.%df}') % digits
    low, high = ('n/a' if x is None else f.format(x * scale) for x in interval[1:])
    return f'{f.format(interval[0] * scale)} [{low}, {high}]'


def describe(hysteresis):
    return ', '.join(f'{SHORT[field]} {hysteresis[field]:g}' for field in FIELDS)


def header(first):
    return [f'| {first} | ' + ' | '.join(title for _, title, _, _ in COLUMNS) + ' | eligible |',
            '|---' * (len(COLUMNS) + 2) + '|']


def line(label, row):
    cells = ' | '.join(fmt(row['metrics'][name], scale, digits) for name, _, scale, digits in COLUMNS)
    return f'| {label} | {cells} | {"yes" if row["eligible"] else "no"} |'


def against_base(label, row):
    cells = ' | '.join(fmt(row['againstBase'][name], scale, digits, True) for name, _, scale, digits in COLUMNS)
    return f'| {label} | {cells} | |'


def slices(pick, rows):
    """Each field's values with every other field at the pick's: the rows a one-field move from the pick reaches"""
    chosen = rows[pick]['hysteresis']
    out = []
    for field in FIELDS:
        same = [i for i, row in enumerate(rows)
                if all(row['hysteresis'][other] == chosen[other] for other in FIELDS if other != field)]
        if len(same) > 1:
            out.append((field, sorted(same, key=lambda i: rows[i]['hysteresis'][field])))
    return out


def engine_section(engine):
    rows = engine['rows']
    base, best, pick = engine['base'], engine['best'], engine['pick']
    out = [f'## {engine["engine"]}\n',
           f'{engine["tracks"]} dev tracks, {engine["steadyTracks"]} with a steady label. {len(rows)} rows, '
           f'{sum(r["eligible"] for r in rows)} eligible, {len(engine["near"])} within the noise of the best on false-locked. '
           f'Pick bracketed: {"yes" if engine["bracketed"] else "no, at the edge of " + ", ".join(engine["edgeFields"])}. '
           f'Pick less best on false-locked: {fmt(engine["pickAgainstBest"], 100, 2, True)} points.\n']
    out += header('row')
    for label, index in (('contract (base)', base), ('best', best), ('pick', pick)):
        out.append(line(f'{label}: {describe(rows[index]["hysteresis"])}', rows[index]))
    out.append('\nPaired against the contract\'s row:\n')
    out += header('row')
    for label, index in (('best', best), ('pick', pick)):
        out.append(against_base(label, rows[index]))
    for field, indices in slices(pick, rows):
        out.append(f'\n{SHORT[field]}, other fields at the pick:\n')
        out += header(SHORT[field])
        for index in indices:
            mark = ' (pick)' if index == pick else ' (contract)' if index == base else ''
            out.append(line(f'{rows[index]["hysteresis"][field]:g}{mark}', rows[index]))
    return '\n'.join(out)


def main(argv):
    if len(argv) != 2:
        raise SystemExit('usage: python3 -I hysteresis_table.py <hysteresis-report.json>')
    with open(argv[1], encoding='utf-8') as file:
        report = json.load(file)
    if report.get('split') != 'dev':
        raise SystemExit(f"the hysteresis tables read dev only, not {report.get('split')}")
    print('\n\n'.join(engine_section(engine) for engine in report['picks']))


if __name__ == '__main__':
    main(sys.argv)
