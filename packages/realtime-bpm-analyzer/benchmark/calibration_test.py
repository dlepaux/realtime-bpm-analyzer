"""Checks of calibration.py's rules: `python3 -I benchmark/calibration_test.py` from the package"""

import contextlib
import io
import json
import os
import random
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from calibration import (HELDOUT_BAR, analyse, apply_mapping, apply_table, fit_table, heldout_report, heldout_verdict,  # noqa: E402
                         is_check, is_correct, is_octave, load, main, pav, readings_of, sample, top_half)


def track(statuses, readings, truth=120.0, group='a', offline=None, set_name='free-mixes'):
    return {'set': set_name, 'group': group, 'truth': truth, 'statuses': statuses, 'readings': readings, 'offline': offline}


def synthetic(count, calibrated, seed=1):
    """Readings whose raw confidence c is right with chance c (calibrated) or c squared (overconfident)"""
    rng = random.Random(seed)
    out = []
    for i in range(count):
        raw = rng.random()
        right = rng.random() < (raw if calibrated else raw * raw)
        s = sample((120.0 if right else 126.0, raw), 120.0, ('free-mixes', f'g{i % 400}'), 'end', 'realtime')
        out.append({**s, 'check': is_check({'set': 'free-mixes', 'group': f'g{i % 400}'})})
    return out


class Correctness(unittest.TestCase):
    def test_acc1_at_four_percent(self):
        self.assertTrue(is_correct(124.8, 120))
        self.assertFalse(is_correct(125, 120))

    def test_octave_errors_are_apart_and_wrong(self):
        self.assertTrue(is_octave(240, 120))
        self.assertTrue(is_octave(60, 120))
        self.assertTrue(is_octave(40, 120))
        self.assertFalse(is_octave(120, 120))
        self.assertFalse(is_octave(150, 120))


class Readings(unittest.TestCase):
    def test_only_shown_readings_count(self):
        t = track('012222', [[120, 0.1], [121, 0.2], [119, 0.3], [150, 0.4], [120, 0.5], [120, 0.6]], offline=[120, 0.7])
        out = readings_of(t)
        self.assertEqual([s['time'] for s in out], ['15 s', '20 s', '30 s', '45 s', 'end', 'offline'])
        self.assertEqual([s['right'] for s in out], [True, True, False, True, True, True])

    def test_a_short_track_keeps_its_end(self):
        out = readings_of(track('22', [[120, 0.5], [120, 0.6]]))
        self.assertEqual([s['time'] for s in out], ['10 s', 'end'])

    def test_out_of_range_confidence_is_refused(self):
        with self.assertRaises(AssertionError):
            sample((120, 1.2), 120, ('s', 'g'), 'end', 'realtime')

    def test_split_is_by_artist_and_about_a_third(self):
        groups = [{'set': 'fsld', 'group': f'artist {i}'} for i in range(3000)]
        share = sum(is_check(g) for g in groups) / len(groups)
        self.assertAlmostEqual(share, 1 / 3, delta=0.03)
        self.assertEqual(is_check(groups[7]), is_check(dict(groups[7])))


class Mapping(unittest.TestCase):
    def test_pav_is_monotone_and_keeps_the_mean(self):
        values, weights = [0.5, 0.3, 0.8, 0.6, 0.9], [1, 3, 2, 2, 1]
        fitted = pav(values, weights)
        self.assertEqual(fitted, sorted(fitted))
        self.assertAlmostEqual(sum(v * w for v, w in zip(fitted, weights)), sum(v * w for v, w in zip(values, weights)))

    def test_table_is_monotone(self):
        table = fit_table(synthetic(4000, calibrated=False))
        self.assertEqual([y for _, y in table], sorted(y for _, y in table))
        self.assertEqual([x for x, _ in table], sorted(x for x, _ in table))

    def test_table_reads_by_interpolation_flat_past_its_ends(self):
        table = [[0.2, 0.1], [0.6, 0.5]]
        self.assertAlmostEqual(apply_table(table, 0.4), 0.3)
        self.assertEqual(apply_table(table, 0.0), 0.1)
        self.assertEqual(apply_table(table, 0.9), 0.5)


def banded(count, seed=2):
    """Readings that are calibrated under 140 BPM and right far less often above 165"""
    rng = random.Random(seed)
    out = []
    for i in range(count):
        raw, fast = rng.random(), i % 2 == 0
        truth = 170.0 if fast else 120.0
        right = rng.random() < (raw * 0.4 if fast else raw)
        s = sample((truth if right else truth * 1.2, raw), truth, ('free-mixes', f'g{i % 400}'), 'end', 'realtime')
        out.append({**s, 'check': is_check({'set': 'free-mixes', 'group': f'g{i % 400}'})})
    return out


class Bands(unittest.TestCase):
    def test_a_band_reads_its_own_table(self):
        mapping = {'all': [[0.0, 0.1], [1.0, 0.9]], 'bands': {'165 and over': [[0.0, 0.0], [1.0, 0.4]]}}
        self.assertAlmostEqual(apply_mapping(mapping, 0.5, 120), 0.5)
        self.assertAlmostEqual(apply_mapping(mapping, 0.5, 170), 0.2)
        self.assertAlmostEqual(apply_mapping([[0.0, 0.1], [1.0, 0.9]], 0.5, 170), 0.5)

    def test_a_miscalibrated_band_gets_a_table_that_fixes_it(self):
        result = analyse(banded(8000))
        self.assertIn('165 and over', result['band tables needed'])
        residual = result['check with band tables']['bands']['165 and over']
        self.assertLessEqual(residual[1], 0)
        self.assertGreaterEqual(residual[2], 0)
        self.assertIn('165 and over', result['tables']['realtime']['bands'])

    def test_no_band_table_when_none_is_needed(self):
        result = analyse(synthetic(6000, calibrated=False))
        self.assertEqual(result['band tables needed'], [])
        self.assertIsNone(result['check with band tables'])
        self.assertEqual(result['tables']['realtime']['bands'], {})


class Analysis(unittest.TestCase):
    def test_overconfident_scores_are_corrected_on_the_check_part(self):
        result = analyse(synthetic(6000, calibrated=False))
        ece = result['check']['ece']
        self.assertLess(ece['after'][0], ece['before'][0])
        self.assertLess(ece['after less before'][2], 0)
        self.assertTrue(result['adds something'])

    def test_a_score_that_ranks_nothing_adds_nothing(self):
        rng = random.Random(3)
        samples = []
        for s in synthetic(4000, calibrated=True):
            right = rng.random() < 0.7
            samples.append({**s, 'right': right})
        self.assertFalse(analyse(samples)['adds something'])

    def test_top_half_ranks_by_raw(self):
        samples = synthetic(2000, calibrated=True)
        value, low, high = top_half(samples)
        self.assertGreater(low, 0)
        self.assertLessEqual(low, value)
        self.assertLessEqual(value, high)


class HeldoutBar(unittest.TestCase):
    def test_the_bar_is_the_committed_one(self):
        self.assertEqual(HELDOUT_BAR, {'ece_max': 0.05, 'ece_high_max': 0.08, 'brier_not_worse': True, 'top_half_low_min': 0.0})

    def test_a_calibrated_table_passes(self):
        samples = synthetic(6000, calibrated=False)
        table = fit_table(samples)
        heldout = synthetic(6000, calibrated=False, seed=9)
        self.assertTrue(heldout_verdict(heldout_report(table, heldout)))

    def test_a_table_off_by_much_fails(self):
        heldout = synthetic(6000, calibrated=False, seed=9)
        always_high = [[0.0, 0.9], [1.0, 0.95]]
        self.assertFalse(heldout_verdict(heldout_report(always_high, heldout)))


class Load(unittest.TestCase):
    def test_refuses_anything_but_dev(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, 'samples.json')
            with open(path, 'w', encoding='utf-8') as file:
                json.dump({'split': 'heldout', 'hysteresis': {}, 'samples': {}}, file)
            with self.assertRaises(SystemExit):
                load(path)

    def test_main_writes_aggregates_only(self):
        rng = random.Random(5)
        tracks = []
        for i in range(600):
            raw = rng.random()
            bpm = 120.0 if rng.random() < raw else 150.0
            tracks.append(track('222222', [[bpm, raw]] * 6, group=f'g{i % 90}', offline=[bpm, raw]))
        with tempfile.TemporaryDirectory() as directory:
            path, out = os.path.join(directory, 'samples.json'), os.path.join(directory, 'report.json')
            with open(path, 'w', encoding='utf-8') as file:
                json.dump({'split': 'dev', 'hysteresis': {'tempogram': {'lockBand': 0.02}}, 'samples': {'tempogram': tracks}}, file)
            with contextlib.redirect_stdout(io.StringIO()) as printed:
                main(['calibration.py', path, out])
            with open(out, encoding='utf-8') as file:
                report = file.read()
        self.assertIn('## tempogram', printed.getvalue())
        self.assertNotIn('g1', report)


if __name__ == '__main__':
    unittest.main()
