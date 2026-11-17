"""RBA-221's level-relative search at its edges, which the conformance inputs reach only in the middle."""

from __future__ import annotations

import re
from pathlib import Path

import numpy as np

from realtime_bpm_analyzer import Lowpass, analyze_channel_data
from realtime_bpm_analyzer._peaks import (
    LEVEL_PERCENTILE,
    SILENCE_FLOOR,
    find_peaks_relative_to_level,
    level_reference,
)

CONSTS = Path(__file__).resolve().parents[2] / "realtime-bpm-analyzer" / "src" / "core" / "consts.ts"


def _level(*maxima: float) -> float:
    """One window a sample long per value, at 4 Hz, where a 0.25 s window is one sample."""
    return level_reference(np.asarray(maxima, dtype=np.float64), 4)


def test_takes_the_maximum_at_the_floored_percentile_index() -> None:
    # 100 windows: floor(99 * 98 / 100) = 97, the 98th value, not NumPy's interpolated percentile
    assert _level(*[(100 - i) / 1000 for i in range(100)]) == 98 / 1000
    # Two windows: floor(1 * 98 / 100) = 0, so the louder one never sets the level
    assert _level(0.9, 0.1) == 0.1
    assert _level(0.5) == 0.5


def test_counts_only_positive_samples_and_a_shorter_last_window() -> None:
    # At 8 Hz a window is two samples: [-0.9, 0.2], [0.3, -0.5], [0.4]
    assert level_reference(np.asarray([-0.9, 0.2, 0.3, -0.5, 0.4]), 8) == 0.3
    assert level_reference(np.asarray([-0.9, -0.2]), 8) == 0.0
    assert level_reference(np.asarray([], dtype=np.float64), 8) == 0.0
    # A NaN sample never becomes a window's maximum, as in JS
    assert level_reference(np.asarray([np.nan, 0.2, 0.3, np.nan]), 8) == 0.2


def test_a_window_past_the_whole_input_is_the_whole_input() -> None:
    assert level_reference(np.asarray([0.1, 0.4, 0.2]), 1e300) == 0.4


def test_searches_nothing_under_the_floor_or_at_full_scale() -> None:
    assert find_peaks_relative_to_level(np.ones(64), 4) == []
    assert find_peaks_relative_to_level(np.full(64, SILENCE_FLOOR * 0.99), 4) == []


def test_reads_a_quiet_pulse_with_its_confidence_unmeasured() -> None:
    # A one-sample click every 0.5 s at 1 kHz, 20 s, at -40 dBFS: the fixed ladder finds nothing in it
    samples = np.zeros(20_000, dtype=np.float32)
    samples[::500] = 0.01
    reading = analyze_channel_data(samples, 1_000, engine="peaks", lowpass=Lowpass(frequency=400, q=1))
    assert reading is not None
    assert reading.bpm == 120
    assert reading.confidence is None


def test_constants_are_the_js_librarys() -> None:
    source = CONSTS.read_text(encoding="utf-8")
    for name, value in (("levelPercentile", float(LEVEL_PERCENTILE)), ("silenceFloor", SILENCE_FLOOR)):
        match = re.search(rf"export const {name} = ([0-9.]+);", source)
        assert match is not None, name
        assert float(match.group(1)) == value, name
