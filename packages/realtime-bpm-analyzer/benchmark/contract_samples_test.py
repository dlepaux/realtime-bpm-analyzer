"""Checks of contract_samples.py: `python3 -I benchmark/contract_samples_test.py` from the package"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from contract_samples import rebuild  # noqa: E402

CONTRACT = {'pulseLostAfterSeconds': 2}
PICKED = {'pulseLostAfterSeconds': 1}


def fixture():
    record = {'rows': [[0, 0, 0, 0, 0, 0, '22'], [0, 0, 0, 0, 0, 0, '02']], 'readings': [[[120, 0.5], [121, 0.6]], [[90, 0.1], [91, 0.2]]]}
    dev = {'split': 'dev', 'results': {'peaks-hysteresis': [{'set': 's', 'id': 'a', 'hysteresis': record}]}}
    samples = {'split': 'dev', 'hysteresis': {'tempogram': CONTRACT, 'peaks': PICKED},
               'samples': {'tempogram': ['kept'], 'peaks': [{'set': 's', 'id': 'a', 'statuses': '02', 'readings': [[90, 0.1], [91, 0.2]], 'offline': [120, 0.4]}]}}
    report = {'split': 'dev', 'picks': [{'engine': 'peaks', 'base': 0, 'rows': [{'hysteresis': CONTRACT}, {'hysteresis': PICKED}]}]}
    return dev, samples, report


class Rebuild(unittest.TestCase):
    def test_peaks_takes_its_contract_row(self):
        out = rebuild(*fixture())
        track = out['samples']['peaks'][0]
        self.assertEqual(track['statuses'], '22')
        self.assertEqual(track['readings'], [[120, 0.5], [121, 0.6]])
        self.assertEqual(track['offline'], [120, 0.4])
        self.assertEqual(out['hysteresis']['peaks'], CONTRACT)

    def test_tempogram_is_kept(self):
        self.assertEqual(rebuild(*fixture())['samples']['tempogram'], ['kept'])

    def test_a_different_track_order_is_refused(self):
        dev, samples, report = fixture()
        samples['samples']['peaks'][0]['id'] = 'b'
        with self.assertRaises(SystemExit):
            rebuild(dev, samples, report)


if __name__ == '__main__':
    unittest.main()
