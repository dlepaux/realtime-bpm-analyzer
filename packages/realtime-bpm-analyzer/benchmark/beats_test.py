"""Checks of RBA-109's beat scripts: `python3 -I benchmark/beats_test.py` from the package"""

import os
import random
import struct
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from beats_metrics import continuity, f_measure, scores  # noqa: E402
from beats_realtime import predictions  # noqa: E402
from beats_split import build, seal  # noqa: E402
from beats_stats import summarise  # noqa: E402
from beats_tracker import CURVE_DELAY, FRAME_RATE, grid_baseline, track  # noqa: E402
from beats_truth import groove_beats, loop_beats  # noqa: E402

GRID = [0.5 * k for k in range(40)]


def pulse_curve(bpm, seconds, phase=0.0, noise=0.0, seed=1):
    """An onset curve with a spike where frame_time puts audio at each beat"""
    rng = random.Random(seed)
    n = int(seconds * FRAME_RATE)
    curve = [rng.random() * noise for _ in range(n)]
    beat = 60.0 / bpm
    t = phase
    while t < seconds:
        i = int(round((t + CURVE_DELAY) * FRAME_RATE - 1))
        if 0 <= i < n:
            curve[i] += 1.0
        t += beat
    return curve


class Metrics(unittest.TestCase):
    def test_perfect(self):
        self.assertEqual(f_measure(GRID, GRID), 1.0)
        self.assertEqual(continuity(GRID, GRID), (1.0, 1.0, 1.0, 1.0))

    def test_window(self):
        self.assertEqual(f_measure(GRID, [t + 0.069 for t in GRID]), 1.0)
        self.assertEqual(f_measure(GRID, [t + 0.071 for t in GRID]), 0.0)

    def test_half_and_off_beat_score_only_aml(self):
        double = [0.25 * k for k in range(80)]
        off = [t + 0.25 for t in GRID]
        for estimate in (double, off, GRID[::2]):
            _, cml_t, _, aml_t = continuity(GRID, estimate)
            self.assertEqual(cml_t, 0.0)
            self.assertGreater(aml_t, 0.9)

    def test_one_to_one(self):
        # Two estimates near one reference count once
        self.assertAlmostEqual(f_measure([1.0], [0.99, 1.01]), 2 * 0.5 * 1 / 1.5)

    def test_empty(self):
        self.assertEqual(scores(GRID, [])['F'], 0.0)

    def test_trim_drops_the_first_five_seconds(self):
        early = [t for t in GRID if t < 5] + [t + 0.2 for t in GRID if t >= 5]
        self.assertEqual(scores(GRID, early)['F'], 0.0)


class Tracker(unittest.TestCase):
    def test_finds_the_beats_of_a_clean_pulse(self):
        for bpm, phase in ((120, 0.13), (95, 0.31), (172, 0.05)):
            truth = [phase + k * 60 / bpm for k in range(int(20 * bpm / 60))]
            truth = [t for t in truth if t < 20]
            beats = track(pulse_curve(bpm, 20, phase, noise=0.3), bpm)
            self.assertGreater(scores(truth, beats)['F'], 95, bpm)

    def test_follows_the_phase_where_a_grid_drifts(self):
        # Played 1% faster than the engine reads: the grid drifts off, the tracker follows
        truth = [0.2 + k * 0.5 / 1.01 for k in range(60)]
        curve = pulse_curve(121.2, 30, 0.2)
        self.assertGreater(scores(truth, track(curve, 120))['F'], 95)
        self.assertLess(scores(truth, grid_baseline(curve, 120))['F'], 60)

    def test_no_tempo_no_beats(self):
        self.assertEqual(track([0.0] * 100, None), [])
        self.assertEqual(grid_baseline([1.0] * 100, 0), [])


class Realtime(unittest.TestCase):
    def test_a_steady_pulse_predicts_close(self):
        truth = [0.1 + 0.5 * k for k in range(60)]
        errors, missed = predictions(pulse_curve(120, 30, 0.1), [[4.0, 120, 0.5]], truth, 30)
        self.assertEqual(missed, 0)
        for h, values in errors.items():
            self.assertTrue(values, h)
            self.assertLess(max(abs(e) for e in values), 0.015, h)

    def test_nothing_before_the_first_reading(self):
        errors, missed = predictions(pulse_curve(120, 30), [[29.0, 120, 0.5]], GRID, 30)
        self.assertTrue(all(not v for v in errors.values()))
        self.assertGreater(missed, 0)


def write_midi(path, bpm, notes_ticks, ppq=480):
    def varlen(v):
        out = [v & 0x7F]
        v >>= 7
        while v:
            out.insert(0, (v & 0x7F) | 0x80)
            v >>= 7
        return bytes(out)
    us = round(60e6 / bpm)
    body = varlen(0) + b'\xff\x51\x03' + us.to_bytes(3, 'big') + varlen(0) + b'\xff\x58\x04\x04\x02\x18\x08'
    last = 0
    for tick in notes_ticks:
        body += varlen(tick - last) + b'\x99\x24\x64' + varlen(10) + b'\x24\x00'  # running status note-off
        last = tick + 10
    body += varlen(0) + b'\xff\x2f\x00'
    with open(path, 'wb') as handle:
        handle.write(b'MThd' + struct.pack('>IHHH', 6, 0, 1, ppq) + b'MTrk' + struct.pack('>I', len(body)) + body)


class Truth(unittest.TestCase):
    def test_groove_grid_from_the_midi_tempo(self):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, 'a.mid')
            write_midi(path, 100, [480 * k for k in range(1, 17)])
            truth = groove_beats(path, 30.0)
        self.assertAlmostEqual(truth['bpm'], 100, places=3)
        self.assertAlmostEqual(truth['beats'][0], 0.6, places=6)
        self.assertAlmostEqual(truth['beats'][-1], 16 * 0.6, places=6)
        self.assertEqual(truth['downbeats'][0], truth['beats'][3])
        self.assertEqual(truth['meters'], [(4, 4)])

    def test_loop_must_hold_whole_beats(self):
        whole = loop_beats(4 * 22050, 120, 3 * 4 * 22050)
        self.assertEqual(whole['beatsPerLoop'], 4)
        self.assertEqual(len(whole['beats']), 12)
        self.assertIsNone(loop_beats(int(4.1 * 22050), 120, 30 * 44100))


class Split(unittest.TestCase):
    def test_no_source_on_both_sides_and_inside_the_tempo_halves(self):
        split = build()
        for name, source_of in (('groove', lambda t: t.split('-')[0]), ('guitarset', lambda t: t[:2])):
            dev = {source_of(t) for t in split['dev'][name]}
            held = {source_of(t) for t in split['heldout'][name]}
            self.assertFalse(dev & held, name)
        self.assertEqual(split['heldoutSha256'], seal(split['heldout']))

    def test_committed_split_is_what_the_rule_builds(self):
        import json
        here = os.path.dirname(os.path.abspath(__file__))
        with open(os.path.join(here, 'splits', 'beats.json'), encoding='utf8') as handle:
            self.assertEqual(json.load(handle), json.loads(json.dumps(build())))


class Stats(unittest.TestCase):
    def test_summary_runs_and_ranges_bracket_the_value(self):
        rows = []
        for i in range(12):
            s = ('groove', 'guitarset', 'fsld')[i % 3]
            score = {'F': 50.0 + i, 'F40': 45.0, 'CMLt': 40.0, 'AMLt': 60.0}
            rows.append({'set': s, 'id': f'drummer{i % 2}-x-{i}' if s == 'groove' else f'0{i % 2}_x{i}',
                         'group': f'u{i % 2}', 'truth': 120, 'offline': 120, 'trueBpm': 120.0, 'beats': 10,
                         'tracker': score, 'baseline': score, 'oracle': score, 'offsets': [0.01],
                         'realtime': {'0.0': [0.01, -0.02]}, 'missed': 0})
        summary = summarise(rows)
        f = summary['pooled']['tracker']['F']
        self.assertLessEqual(f['lo'], f['value'])
        self.assertGreaterEqual(f['hi'], f['value'])
        self.assertEqual(summary['realtime']['all']['0.0']['median ms']['value'], 10.5)


if __name__ == '__main__':
    unittest.main()
