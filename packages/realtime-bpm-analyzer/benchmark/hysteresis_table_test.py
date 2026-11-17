"""Checks of hysteresis_table.py: `python3 -I benchmark/hysteresis_table_test.py` from the package"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hysteresis_table import COLUMNS, engine_section, fmt, slices  # noqa: E402


def row(lock_band, unlock_band, false_locked, eligible=True):
    metrics = {name: [0.5, 0.4, 0.6] for name, _, _, _ in COLUMNS}
    metrics['falseLocked'] = [false_locked, false_locked - 0.01, false_locked + 0.01]
    metrics['p90FirstLock'] = [30, None, None]
    return {'hysteresis': {'lockBand': lock_band, 'lockAfterSeconds': 8, 'unlockBand': unlock_band,
                           'unlockAfterSeconds': 2, 'pulseLostAfterSeconds': 2},
            'metrics': metrics, 'againstBase': {name: [0, -0.1, 0.1] for name, _, _, _ in COLUMNS}, 'eligible': eligible}


class Table(unittest.TestCase):
    rows = [row(0.01, 0.04, 0.2), row(0.02, 0.04, 0.1), row(0.03, 0.04, 0.15), row(0.02, 0.06, 0.12)]

    def test_slices_move_one_field_from_the_pick(self):
        found = dict(slices(1, self.rows))
        self.assertEqual(found['lockBand'], [0, 1, 2])
        self.assertEqual(found['unlockBand'], [1, 3])
        self.assertNotIn('lockAfterSeconds', found)

    def test_a_missing_range_prints_as_such(self):
        self.assertEqual(fmt([30, None, None], 1, 1), '30.0 [n/a, n/a]')
        self.assertEqual(fmt([0.1, 0.05, 0.2], 100, 1, True), '+10.0 [+5.0, +20.0]')

    def test_section_names_the_pick(self):
        text = engine_section({'engine': 'tempogram', 'tracks': 10, 'steadyTracks': 5, 'rows': self.rows, 'base': 1,
                               'best': 1, 'near': [1], 'pick': 1, 'bracketed': True, 'edgeFields': [],
                               'pickAgainstBest': [0, 0, 0]})
        self.assertIn('0.02 (pick)', text)
        self.assertIn('Pick bracketed: yes', text)


if __name__ == '__main__':
    unittest.main()
