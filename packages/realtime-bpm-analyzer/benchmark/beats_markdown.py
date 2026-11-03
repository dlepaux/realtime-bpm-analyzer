"""RBA-109: the dev tables of beats_stats.py's summary as markdown"""

SETS = ('groove', 'guitarset', 'fsld')
METRICS = ('F', 'F40', 'CMLt', 'AMLt')
LABELS = {'tracker': 'DP tracker, engine tempo', 'baseline': 'grid baseline, engine tempo',
          'oracle': 'DP tracker, true tempo (diagnostic)', 'tracker - baseline': 'tracker minus baseline'}


def cell(r, digits=1):
    if not r or r.get('value') is None:
        return 'n/a'
    if 'lo' not in r or r['lo'] is None:
        return f"{r['value']:.{digits}f}"
    return f"{r['value']:.{digits}f} [{r['lo']:.{digits}f}, {r['hi']:.{digits}f}]"


def _scores_table(rows):
    lines = ['| group | tracks | method | F (70 ms) | F (40 ms) | CMLt | AMLt |', '|---|---:|---|---|---|---|---|']
    for name, block in rows:
        for method in ('tracker', 'baseline', 'tracker - baseline', 'oracle'):
            values = ' | '.join(cell(block[method][m]) for m in METRICS)
            lines.append(f"| {name} | {block['tracks']} | {LABELS[method]} | {values} |")
    return '\n'.join(lines)


def _realtime_table(realtime):
    lines = ['| tracks | lookahead s | predictions | median abs error ms | p90 abs error ms | within 20 ms % | within 40 ms % |',
             '|---|---:|---:|---|---|---|---|']
    for name, block in realtime.items():
        for h, stats in block.items():
            if not stats:
                continue
            lines.append(f"| {name} | {h} | {stats['predictions']['value']} | {cell(stats['median ms'], 0)} | "
                         f"{cell(stats['p90 ms'], 0)} | {cell(stats['within 20 ms'])} | {cell(stats['within 40 ms'])} |")
    return '\n'.join(lines)


def render(summary):
    data = ['| set | tracks scored | refused by the truth rule | sources | beats after 5 s |', '|---|---:|---:|---:|---:|']
    for s in SETS:
        data.append(f"| {s} | {summary['tracks'][s]} | {summary['refused'][s]} | {summary['sources'][s]} | {summary['beats'][s]} |")
    offsets = ' · '.join(f"{s} {summary['offset ms'][s]:+.1f}" for s in SETS if summary['offset ms'][s] is not None)
    parts = [
        '### Dev data', '\n'.join(data),
        '### Scores per set, pooled over tracks', _scores_table([('all', summary['pooled'])] + [(s, summary[s]) for s in SETS]),
        '### Scores per tempo band (true tempo)', _scores_table(list(summary['bands'].items())),
        '### Scores by the engine tempo against the truth', _scores_table(list(summary['tempo classes'].items())),
        '### Timing bias', f'Median signed error of tracked beats matched within 70 ms, ms (positive is late): {offsets}.',
        '### Realtime prediction', _realtime_table(summary['realtime']),
        f"Instants with no prediction (no engine reading yet, or no beat tracked): {summary['realtime missed']}.",
    ]
    return '\n\n'.join(parts) + '\n'
