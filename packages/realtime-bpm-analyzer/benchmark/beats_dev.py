"""RBA-109 phase 0: score the beat tracker on beat dev only, where the data lives.

    python3 -I benchmark/beats_dev.py run <data root> <curves dir> <dev.json> <rows.jsonl> [workers]
    python3 -I benchmark/beats_dev.py report <rows.jsonl> <out.md> <out.json>

`run` writes one row per track (it stays with the data). `report` prints aggregates only.

Dev only, three ways: the ids come from `dev` of splits/beats.json and nothing reads its `heldout`;
the job's result file must say `split: dev`; and every row's id is checked against beat dev. The
engine is the 5.5.0 tempogram as run by RBA-51's job (dev-7311b4beee00.json), and the onset curves are
the ones its third sweep cached, so no audio is decoded here.
"""

import json
import os
import sys
from multiprocessing import Pool
from array import array

# -I leaves the script's own folder off the path (Python 3.11 and up), and these modules sit beside it
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from beats_metrics import F_WINDOW, scores, trim
from beats_realtime import LOOKAHEADS, predictions
from beats_truth import groove_beats, guitarset_beats, loop_beats
from beats_tracker import CURVE_DELAY, grid_baseline, track
from beats_stats import report

HERE = os.path.dirname(os.path.abspath(__file__))
SETS = ('groove', 'guitarset', 'fsld')
HOP = 441
LOOP_SECONDS = 30


def beat_dev():
    with open(os.path.join(HERE, 'splits', 'beats.json'), encoding='utf8') as handle:
        return {name: set(ids) for name, ids in json.load(handle)['dev'].items()}


def _floats(path):
    values = array('f')
    with open(path, 'rb') as handle:
        values.frombytes(handle.read())
    return values


def _groove_paths(root):
    base = os.path.join(root, 'groove', 'groove')
    with open(os.path.join(base, 'info.csv'), encoding='utf8') as handle:
        header, *rows = [line.rstrip('\r\n').split(',') for line in handle]
    col = {name: i for i, name in enumerate(header)}
    return {r[col['id']].replace('/', '-'): os.path.join(base, r[col['midi_filename']]) for r in rows}


def truth_of(root, row, groove_midi, curve_length):
    """Ground truth beats of a dev track, or None when the set's rule refuses it"""
    if row['set'] == 'groove':
        samples = os.path.getsize(os.path.join(root, 'pcm', 'groove', row['id'] + '.f32')) // 4
        return groove_beats(groove_midi[row['id']], samples / 44100)
    if row['set'] == 'guitarset':
        return guitarset_beats(os.path.join(root, 'free-data-beats', 'guitarset', 'annotation', row['id'] + '.jams'))
    loop = os.path.getsize(os.path.join(root, 'pcm', 'fsld', row['id'] + '.f32')) // 4
    total = -(-LOOP_SECONDS * 44100 // loop) * loop
    assert abs(total // HOP - curve_length) <= 1, (row['id'], total, curve_length)
    return loop_beats(loop, row['truth'], total)


def _matched_offsets(reference, estimated):
    offsets = []
    for t in estimated:
        nearest = min(reference, key=lambda r: abs(r - t))
        if abs(nearest - t) <= F_WINDOW:
            offsets.append(t - nearest)
    return offsets


def note_lag(curve, notes, reach=10):
    """Frame lag that best lines the MIDI notes up with the curve, after CURVE_DELAY: 0 when aligned"""
    frames = [int(round((t + CURVE_DELAY) * 100 - 1)) for t in notes]
    def strength(lag):
        return sum(curve[f + lag] for f in frames if 0 <= f + lag < len(curve))
    return max(range(-reach, reach + 1), key=strength)


def evaluate(job):
    root, curves, row, groove_midi = job
    delay = CURVE_DELAY
    curve = list(_floats(os.path.join(curves, f"{row['set']}-{row['id']}.f32")))
    truth = truth_of(root, row, groove_midi, len(curve))
    base = {k: row[k] for k in ('set', 'id', 'group', 'truth', 'offline')}
    if truth is None:
        return {**base, 'refused': 'loop length is not whole beats'}
    reference = truth['beats']
    span = (reference[0] - 0.5 * 60 / row['truth'], reference[-1] + 0.5 * 60 / row['truth'])
    clip = lambda beats: [b for b in beats if span[0] <= b <= span[1]]
    true_bpm = 60 * (len(reference) - 1) / (reference[-1] - reference[0])
    tracked = clip(track(curve, row['offline'], delay))
    end = len(curve) / 100
    errors, missed = predictions(curve, row['readings'], reference, end, delay)
    return {
        **base, 'trueBpm': true_bpm, 'beats': len(trim(reference)), 'downbeats': len(truth.get('downbeats', [])),
        'tracker': scores(reference, tracked), 'baseline': scores(reference, clip(grid_baseline(curve, row['offline'], delay))),
        'oracle': scores(reference, clip(track(curve, true_bpm, delay))),
        'offsets': _matched_offsets(trim(reference), trim(tracked)),
        'realtime': {str(h): errors[h] for h in LOOKAHEADS}, 'missed': missed,
        'noteLag': note_lag(curve, truth['notes']) if 'notes' in truth else None,
        'meters': truth.get('meters'),
    }


def run(root, curves, dev_path, out_path, workers):
    with open(dev_path, encoding='utf8') as handle:
        dev = json.load(handle)
    assert dev['split'] == 'dev', 'beats_dev reads dev result files only'
    allowed = beat_dev()
    rows = [r for r in dev['results']['tempogram'] if r['set'] in SETS and r['id'] in allowed[r['set']]]
    assert all(r['id'] in allowed[r['set']] for r in rows)
    groove_midi = _groove_paths(root)
    jobs = [(root, curves, r, groove_midi) for r in rows]
    with Pool(workers) as pool, open(out_path + '.tmp', 'w', encoding='utf8') as out:
        for result in pool.imap_unordered(evaluate, jobs, chunksize=4):
            out.write(json.dumps(result) + '\n')
    os.replace(out_path + '.tmp', out_path)
    print('rows', len(rows))


if __name__ == '__main__':
    mode, *args = sys.argv[1:]
    if mode == 'run':
        run(*args[:4], int(args[4]) if len(args) > 4 else 4)
    elif mode == 'report':
        report(*args)
    else:
        raise SystemExit(__doc__)
