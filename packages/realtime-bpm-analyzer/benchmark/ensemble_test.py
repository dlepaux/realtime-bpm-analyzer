"""Checks of ensemble.py's rules: `python3 -I -m unittest benchmark/ensemble_test.py` from the package, or from here"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ensemble import agreement, auroc, confirmed_peaks_lock, first_agreement, is_correct, within  # noqa: E402


def row(final, stable=(), readings=None):
    track = {'truth': 120, 'final': final, 'stable': list(stable)}
    if readings is not None:
        track['readings'] = list(readings)
    return track


class Agreement(unittest.TestCase):
    def test_classes(self):
        self.assertEqual(agreement(120, 121), 'agree2')
        self.assertEqual(agreement(120, 124), 'agree2to4')
        self.assertEqual(agreement(90, 180), 'octave')
        self.assertEqual(agreement(120, 160), 'other')
        self.assertEqual(agreement(120, None), 'tempogram only')
        self.assertEqual(agreement(None, 120), 'peaks only')
        self.assertEqual(agreement(None, None), 'neither')

    def test_within_is_symmetric(self):
        self.assertEqual(within(100, 104, 0.04), within(104, 100, 0.04))

    def test_correct_is_four_percent_inclusive(self):
        self.assertTrue(is_correct(124.8, 120))
        self.assertFalse(is_correct(125, 120))
        self.assertFalse(is_correct(None, 120))


class Ranking(unittest.TestCase):
    def counts(self, pos, neg):
        table = {}
        for level, (p, n) in enumerate(zip(pos, neg)):
            table[f's|rank|x|{level}|pos'] = p
            table[f's|rank|x|{level}|neg'] = n
        return lambda key: table.get(key, 0)

    def test_perfect_and_useless(self):
        self.assertEqual(auroc(self.counts([0, 5], [5, 0]), 'x', 's', range(2)), 1.0)
        self.assertEqual(auroc(self.counts([3, 3], [3, 3]), 'x', 's', range(2)), 0.5)

    def test_no_negative_gives_none(self):
        self.assertIsNone(auroc(self.counts([1, 1], [0, 0]), 'x', 's', range(2)))


class Timelines(unittest.TestCase):
    def test_first_agreement_waits_for_both(self):
        self.assertEqual(first_agreement([(5, 120)], [(8, 121)], 0.04), (8, 120))
        self.assertIsNone(first_agreement([(5, 120)], [(8, 160)], 0.04))

    def test_confirmed_lock_is_causal(self):
        # Peaks locks at 6 s; the tempogram reads 160 until 9 s, then 120: the lock at 6 s is not confirmed, the one at 10 s is
        tempogram = row(120, readings=[(2, 160, 0.3), (9, 120, 0.5)])
        peaks = row(120, stable=[(6, 120), (10, 121)])
        self.assertEqual(confirmed_peaks_lock(tempogram, peaks), 121)
        self.assertIsNone(confirmed_peaks_lock(row(120, readings=[(2, 160, 0.3)]), row(120, stable=[(6, 120)])))


if __name__ == '__main__':
    unittest.main()
