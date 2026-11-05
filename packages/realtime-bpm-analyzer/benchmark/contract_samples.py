"""RBA-106: rebuild peaks' calibration samples under the hysteresis the library ships.

The sweep (benchmark/hysteresis.ts) keeps the samples of each engine's picked row. The library has one shared
`HYSTERESIS`, and it keeps the contract's values (see results/rba-v6-hysteresis-dev.md), so peaks' samples are
taken again from its contract row, which the dev file holds for every row. The tempogram's readings do not depend
on the row, only whether each was shown does, so its samples are kept as the sweep wrote them.

    python3 -I benchmark/contract_samples.py <dev-<sha>.json> <calibration-samples-<sha>.json> <hysteresis-report-<sha>.json> <out.json>

Dev only: it refuses any input not marked dev. Its output is per track and stays on the data volume.
"""

import json
import sys


def load_dev(path):
    with open(path, encoding='utf-8') as file:
        data = json.load(file)
    if data.get('split') != 'dev':
        raise SystemExit(f'{path} is not a dev file: refused')
    return data


def rebuild(dev, samples, report):
    """samples, with peaks' statuses and readings replaced by its contract row's"""
    peaks = next(pick for pick in report['picks'] if pick['engine'] == 'peaks')
    base = peaks['base']
    contract = peaks['rows'][base]['hysteresis']
    results = dev['results']['peaks-hysteresis']
    tracks = samples['samples']['peaks']
    if len(results) != len(tracks):
        raise SystemExit('the dev file and the samples hold different tracks')
    rebuilt = []
    for result, track in zip(results, tracks):
        if (result['set'], result['id']) != (track['set'], track['id']):
            raise SystemExit(f"track order differs at {track['set']}/{track['id']}")
        record = result['hysteresis']
        rebuilt.append({**track, 'statuses': record['rows'][base][6], 'readings': record['readings'][base]})
    return {**samples, 'hysteresis': {**samples['hysteresis'], 'peaks': contract},
            'samples': {**samples['samples'], 'peaks': rebuilt}}


def main(argv):
    if len(argv) != 5:
        raise SystemExit(__doc__)
    dev, samples, report = (load_dev(path) for path in argv[1:4])
    with open(argv[4], 'w', encoding='utf-8') as file:
        json.dump(rebuild(dev, samples, report), file)


if __name__ == '__main__':
    main(sys.argv)
