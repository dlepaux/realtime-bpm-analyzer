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

from calibration import (HELDOUT_BAR, HELDOUT_HYSTERESIS, SAMPLES_FORMAT, analyse, apply_mapping, apply_table, fit_table, heldout_check,  # noqa: E402
                         heldout_report, heldout_verdict, is_check, is_correct, is_octave, load, load_data, main, pav, readings_of,
                         refit, sample, top_half)


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
        t = track('012222', [[120, 0.9, 0.1], [121, 0.9, 0.2], [119, 0.9, 0.3], [150, 0.9, 0.4], [120, 0.9, 0.5], [120, 0.9, 0.6]],
                  offline=[120, 0.9, 0.7])
        out = readings_of(t)
        self.assertEqual([s['time'] for s in out], ['15 s', '20 s', '30 s', '45 s', 'end', 'offline'])
        self.assertEqual([s['right'] for s in out], [True, True, False, True, True, True])

    def test_a_short_track_keeps_its_end(self):
        out = readings_of(track('22', [[120, 0.9, 0.5], [120, 0.9, 0.6]]))
        self.assertEqual([s['time'] for s in out], ['10 s', 'end'])

    # RBA-148: since v6 the recorded confidence is calibrated, so the fit must read the raw score beside it
    def test_the_fit_reads_the_raw_score_not_the_calibrated_one(self):
        out = readings_of(track('22', [[120, 0.8, 0.3], [120, 0.85, 0.4]], offline=[120, 0.9, 0.5]))
        self.assertEqual([(s['raw'], s['shown']) for s in out], [(0.3, 0.8), (0.4, 0.85), (0.5, 0.9)])

    def test_a_file_from_before_rba_148_reads_its_one_score_as_raw(self):
        out = readings_of(track('22', [[120, 0.3], [120, 0.4]], offline=[120, 0.5]), legacy=True)
        self.assertEqual([(s['raw'], s['shown']) for s in out], [(0.3, None), (0.4, None), (0.5, None)])

    def test_a_reading_of_the_wrong_shape_is_refused(self):
        with self.assertRaises(AssertionError):
            readings_of(track('2', [[120, 0.3]]))
        with self.assertRaises(AssertionError):
            readings_of(track('2', [[120, 0.8, 0.3]]), legacy=True)

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


ROW = {'lockBand': 0.02, 'lockAfterSeconds': 8, 'unlockBand': 0.04, 'unlockAfterSeconds': 2, 'pulseLostAfterSeconds': 3}


def recorded_tracks(count, seed, overconfident=True):
    """Tracks as the harness records them before calibration: each reading [bpm, raw], whose raw score r is right
    with chance r squared (overconfident) or r"""
    rng = random.Random(seed)
    out = []
    for i in range(count):
        truth = rng.choice((100.0, 150.0, 170.0))
        readings = []
        for _ in range(6):
            raw = round(rng.random(), 6)
            right = rng.random() < (raw * raw if overconfident else raw)
            readings.append([truth if right else truth * 1.25, raw])
        raw = round(rng.random(), 6)
        offline = [truth if rng.random() < (raw * raw if overconfident else raw) else truth * 1.25, raw]
        out.append({**track('122222', readings, truth=truth, group=f'artist {i % 300}', offline=offline, set_name=('fsld', 'groove')[i % 2]),
                    'id': f't{i}'})
    return out


def with_confidence(tracks, mapping):
    """The same tracks as the harness records them since RBA-148: [bpm, confidence, raw], the confidence being
    `mapping` read at the raw score, as the library's `calibrate` gives it"""
    add = lambda r: None if r is None else [r[0], round(apply_mapping(mapping, r[1], r[0]), 6), r[1]]
    return [{**t, 'readings': [add(r) for r in t['readings']], 'offline': add(t['offline'])} for t in tracks]


def committed_from(tracks):
    """What the dev fit committed from a file of raw scores: the results file `main` writes"""
    hysteresis, samples, _ = load_data({'split': 'dev', 'hysteresis': {'tempogram': ROW}, 'samples': {'tempogram': tracks}}, legacy=True)
    return json.loads(json.dumps({'split': 'dev', 'hysteresis': hysteresis, 'heldout bar': HELDOUT_BAR,
                                  'engines': {engine: analyse(chosen) for engine, chosen in samples.items()}}))


def samples_file(chosen, split='dev', **extra):
    """A samples file as calibration-samples.ts writes it: dev at the fitted row, held-out at the shipped one"""
    row = ROW if split == 'dev' else HELDOUT_HYSTERESIS
    return {'format': SAMPLES_FORMAT, 'split': split, 'hysteresis': {'tempogram': row}, 'samples': {'tempogram': chosen}, **extra}


class Refit(unittest.TestCase):
    """RBA-148: a re-fit on what the harness records now gives the tables the dev fit committed"""

    @classmethod
    def setUpClass(cls):
        cls.raw_tracks = recorded_tracks(1500, seed=11)
        cls.committed = committed_from(cls.raw_tracks)
        cls.mapping = cls.committed['engines']['tempogram']['tables']['realtime']
        cls.recorded = with_confidence(cls.raw_tracks, cls.mapping)

    def test_a_refit_on_recorded_output_reproduces_the_committed_tables(self):
        self.assertTrue(self.mapping['bands'], 'the fixture should need a band table, so bands are reproduced too')
        passed, report = refit(samples_file(self.recorded), self.committed)
        result = report['engines']['tempogram']
        self.assertEqual(result['tables'], self.committed['engines']['tempogram']['tables'])
        self.assertEqual(result['shown mismatches'], 0)
        self.assertTrue(passed)

    def test_reading_the_calibrated_confidence_as_raw_would_not(self):
        as_if_raw = [{**t, 'readings': [r[:2] for r in t['readings']], 'offline': t['offline'][:2]} for t in self.recorded]
        wrong = committed_from(as_if_raw)['engines']['tempogram']['tables']
        self.assertNotEqual(wrong, self.committed['engines']['tempogram']['tables'])

    def test_a_confidence_the_committed_table_does_not_give_fails_the_refit(self):
        tampered = [dict(t) for t in self.recorded]
        tampered[0] = {**tampered[0], 'readings': [[r[0], round(min(1.0, r[1] + 0.01), 6), r[2]] for r in tampered[0]['readings']]}
        passed, report = refit(samples_file(tampered), self.committed)
        self.assertGreater(report['engines']['tempogram']['shown mismatches'], 0)
        self.assertFalse(passed)

    def test_other_data_fails_the_refit(self):
        other = with_confidence(recorded_tracks(1500, seed=12), self.mapping)
        passed, report = refit(samples_file(other), self.committed)
        self.assertFalse(report['engines']['tempogram']['tables equal'])
        self.assertFalse(passed)

    def test_another_row_fails_the_refit(self):
        passed, report = refit({**samples_file(self.recorded), 'hysteresis': {'tempogram': {**ROW, 'pulseLostAfterSeconds': 2}}}, self.committed)
        self.assertFalse(report['engines']['tempogram']['hysteresis as committed'])
        self.assertFalse(passed)

    def test_refit_reads_dev_only(self):
        with self.assertRaises(SystemExit):
            refit(samples_file(self.recorded, split='heldout'), self.committed)

    def test_main_exits_2_on_a_refused_refit_or_a_wrong_call(self):
        with tempfile.TemporaryDirectory() as directory:
            paths = [os.path.join(directory, name) for name in ('samples.json', 'committed.json', 'refit.json')]
            for path, value in zip(paths, (samples_file(self.recorded, split='heldout'), self.committed)):
                with open(path, 'w', encoding='utf-8') as file:
                    json.dump(value, file)
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(main(['calibration.py', 'refit', *paths]), 2)
                self.assertEqual(main(['calibration.py', 'refit', paths[0]]), 2)
            self.assertFalse(os.path.exists(paths[2]))


class HeldoutCheck(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.committed = committed_from(recorded_tracks(1500, seed=11))
        cls.mapping = cls.committed['engines']['tempogram']['tables']['realtime']

    def heldout(self, seed=21, **extra):
        tracks = with_confidence(recorded_tracks(1500, seed=seed), self.mapping)
        return samples_file(tracks, split='heldout', tracks={'fsld': 750, 'groove': 750}, skipped=0, **extra)

    def test_the_shipped_table_on_fresh_data_passes(self):
        verdict = heldout_check(self.heldout(), self.committed)
        self.assertTrue(verdict['passed'])
        self.assertEqual(verdict['bar'], HELDOUT_BAR)
        self.assertEqual(verdict['check']['readings'], 1500 * 6, 'every realtime reading of every held-out track is judged')

    def test_a_table_that_does_not_hold_fails(self):
        calibrated_data = {**self.heldout(), 'samples': {'tempogram': with_confidence(recorded_tracks(1500, seed=21, overconfident=False), self.mapping)}}
        self.assertFalse(heldout_check(calibrated_data, self.committed)['passed'])

    def test_it_reads_held_out_only_here_and_dev_only_elsewhere(self):
        with self.assertRaises(SystemExit):
            heldout_check({**self.heldout(), 'split': 'dev'}, self.committed)
        with self.assertRaises(SystemExit):
            load_data(self.heldout())

    def test_it_judges_only_the_tempogram_at_the_shipped_row(self):
        self.assertEqual(HELDOUT_HYSTERESIS, {**ROW, 'pulseLostAfterSeconds': 2})
        with self.assertRaises(SystemExit):
            heldout_check({**self.heldout(), 'hysteresis': {'tempogram': ROW}}, self.committed)
        with self.assertRaises(SystemExit):
            heldout_check({**self.heldout(), 'samples': {'peaks': []}, 'hysteresis': {'peaks': ROW}}, self.committed)

    def test_it_refuses_confidences_the_committed_table_does_not_give(self):
        data = self.heldout()
        first = data['samples']['tempogram'][0]
        data['samples']['tempogram'][0] = {**first, 'readings': [[r[0], round(min(1.0, r[1] + 0.01), 6), r[2]] for r in first['readings']]}
        with self.assertRaises(SystemExit):
            heldout_check(data, self.committed)

    def run_main(self, samples):
        """main's exit code, and the verdict files it left"""
        with tempfile.TemporaryDirectory() as directory:
            paths = [os.path.join(directory, name) for name in ('samples.json', 'committed.json', 'verdict.md', 'verdict.json')]
            for path, value in zip(paths, (samples, self.committed)):
                with open(path, 'w', encoding='utf-8') as file:
                    json.dump(value, file)
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                code = main(['calibration.py', 'heldout', *paths])
            return code, [os.path.basename(p) for p in paths[2:] if os.path.exists(p)]

    def test_a_refused_or_broken_check_exits_2_and_leaves_no_verdict(self):
        mismatched = self.heldout()
        first = mismatched['samples']['tempogram'][0]
        mismatched['samples']['tempogram'][0] = {**first, 'readings': [[r[0], round(min(1.0, r[1] + 0.01), 6), r[2]] for r in first['readings']]}
        for samples in (mismatched, {**self.heldout(), 'split': 'dev'}, {**self.heldout(), 'samples': {'tempogram': [{'broken': True}]}}):
            self.assertEqual(self.run_main(samples), (2, []))

    def test_a_judged_fail_exits_1_with_its_verdict(self):
        overconfident = {**self.heldout(), 'samples': {'tempogram': with_confidence(recorded_tracks(1500, seed=21, overconfident=False), self.mapping)}}
        self.assertEqual(self.run_main(overconfident), (1, ['verdict.md', 'verdict.json']))

    def test_main_writes_the_verdict_as_aggregates_and_exits_by_it(self):
        with tempfile.TemporaryDirectory() as directory:
            paths = [os.path.join(directory, name) for name in ('samples.json', 'committed.json', 'verdict.md', 'verdict.json')]
            for path, value in zip(paths, (self.heldout(), self.committed)):
                with open(path, 'w', encoding='utf-8') as file:
                    json.dump(value, file)
            with contextlib.redirect_stdout(io.StringIO()):
                code = main(['calibration.py', 'heldout', *paths])
            with open(paths[2], encoding='utf-8') as file:
                markdown = file.read()
            with open(paths[3], encoding='utf-8') as file:
                verdict = json.load(file)
        self.assertEqual(code, 0)
        self.assertTrue(verdict['passed'])
        self.assertIn('held-out calibration check: pass', markdown)
        for text in (markdown, json.dumps(verdict)):
            self.assertNotIn('artist 1', text)
            self.assertNotIn('"t1"', text)


class Load(unittest.TestCase):
    def write(self, directory, value):
        path = os.path.join(directory, 'samples.json')
        with open(path, 'w', encoding='utf-8') as file:
            json.dump(value, file)
        return path

    def test_refuses_anything_but_dev(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.write(directory, {'format': SAMPLES_FORMAT, 'split': 'heldout', 'hysteresis': {}, 'samples': {}})
            with self.assertRaises(SystemExit):
                load(path)

    def test_a_file_from_before_rba_148_needs_the_legacy_flag_and_only_it_takes_one(self):
        with tempfile.TemporaryDirectory() as directory:
            old = self.write(directory, {'split': 'dev', 'hysteresis': {}, 'samples': {'tempogram': [track('2', [[120, 0.3]])]}})
            with self.assertRaises(SystemExit):
                load(old)
            self.assertEqual(load(old, legacy=True)[1]['tempogram'][0]['raw'], 0.3)
            new = self.write(directory, samples_file([track('2', [[120, 0.8, 0.3]])]))
            with self.assertRaises(SystemExit):
                load(new, legacy=True)

    def test_main_writes_aggregates_only(self):
        rng = random.Random(5)
        tracks = []
        for i in range(600):
            raw = rng.random()
            bpm = 120.0 if rng.random() < raw else 150.0
            tracks.append(track('222222', [[bpm, 0.5, raw]] * 6, group=f'g{i % 90}', offline=[bpm, 0.5, raw]))
        with tempfile.TemporaryDirectory() as directory:
            path, out = os.path.join(directory, 'samples.json'), os.path.join(directory, 'report.json')
            with open(path, 'w', encoding='utf-8') as file:
                json.dump({'format': SAMPLES_FORMAT, 'split': 'dev', 'hysteresis': {'tempogram': {'lockBand': 0.02}}, 'samples': {'tempogram': tracks}}, file)
            with contextlib.redirect_stdout(io.StringIO()) as printed:
                main(['calibration.py', path, out])
            with open(out, encoding='utf-8') as file:
                report = file.read()
        self.assertIn('## tempogram', printed.getvalue())
        self.assertNotIn('g1', report)


if __name__ == '__main__':
    unittest.main()
