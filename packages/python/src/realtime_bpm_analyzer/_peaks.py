"""The `peaks` engine: a biquad lowpass, bass peaks over a falling threshold, and votes for the intervals between them.

A port of packages/realtime-bpm-analyzer/src/core/{lowpass,peak-detection,tempo,detect-tempo}.ts, offline path.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from ._jsmath import js_round
from ._types import TempoRange

START_THRESHOLD = 0.95
MIN_VALID_THRESHOLD = 0.2
THRESHOLD_STEP = 0.05
MIN_PEAKS = 15
PEAK_SKIP_SECONDS = 0.25
# The lowest rate whose skip rounds to at least one sample, js_round(0.25 * 2) == 1
MINIMUM_SAMPLE_RATE = 2
MAX_INTERVAL_COMPARISONS = 10
MAX_CANDIDATES = 5
# The percentile of the per-window maxima taken as a channel's level when the fixed ladder finds no peaks
LEVEL_PERCENTILE = 98
# -70 dBFS: under it the level-relative search reads silence. Written out as JS writes it, the same double
SILENCE_FLOOR = 0.00031622776601683794
_THRESHOLD_DECIMALS = 1e9
# The recursion runs in Python, a block at a time, so the floats it holds stay bounded on long inputs
_FILTER_BLOCK = 1 << 16


@dataclass(frozen=True, slots=True)
class Tempo:
    """One whole-BPM candidate: its unrounded tempo, its vote count and its raw score from 0 to 1."""

    tempo: int
    exact: float
    count: int
    confidence: float


def lowpass_coefficients(frequency: float, q: float, sample_rate: float) -> tuple[float, float, float, float, float]:
    """b0, b1, b2, a1, a2 as the Web Audio spec defines a `lowpass` BiquadFilterNode, with Q in dB."""
    w0 = math.pi * (frequency / (sample_rate / 2))
    cos_w0 = math.cos(w0)
    alpha = math.sin(w0) / (2 * (10 ** (q / 20)))
    a0 = 1 + alpha
    return (
        ((1 - cos_w0) / 2) / a0,
        (1 - cos_w0) / a0,
        ((1 - cos_w0) / 2) / a0,
        (-2 * cos_w0) / a0,
        (1 - alpha) / a0,
    )


def apply_lowpass(samples: NDArray[np.float64], sample_rate: float, frequency: float, q: float) -> NDArray[np.float32]:
    """The filtered samples, stored as 32-bit floats as the reference stores them, from double-precision state.

    The reference computes `b0*x0 + b1*x1 + b2*x2 - a1*y1 - a2*y2` left to right. The feed-forward part is a prefix
    of that sum, so NumPy computes it for the whole input in the same order; only the feedback runs in a loop.
    """
    b0, b1, b2, a1, a2 = lowpass_coefficients(frequency, q, sample_rate)
    x1 = np.concatenate(([0.0], samples[:-1]))
    x2 = np.concatenate(([0.0, 0.0], samples[:-2]))[: len(samples)]
    forward = (b0 * samples + b1 * x1) + b2 * x2
    output = np.empty(len(samples), dtype=np.float32)
    y1 = 0.0
    y2 = 0.0
    for start in range(0, len(samples), _FILTER_BLOCK):
        block = forward[start : start + _FILTER_BLOCK].tolist()
        for index, value in enumerate(block):
            y0 = value - (a1 * y1) - (a2 * y2)
            block[index] = y0
            y2 = y1
            y1 = y0
        output[start : start + len(block)] = block
    return output


def threshold_ladder() -> list[float]:
    """0.9, 0.85, ... 0.2: each rung rounded to 9 decimals as the reference rounds it, so they compare the same."""
    rungs: list[float] = []
    for n in range(1, max(1, math.ceil(START_THRESHOLD / THRESHOLD_STEP)) + 1):
        threshold = js_round((START_THRESHOLD - (n * THRESHOLD_STEP)) * _THRESHOLD_DECIMALS) / _THRESHOLD_DECIMALS
        rungs.append(threshold)
        if threshold <= MIN_VALID_THRESHOLD:
            break
    return rungs


def find_peaks_at_threshold(data: NDArray[np.float64], threshold: float, skip: int) -> list[int]:
    """Each index above the threshold, then the next one at least `skip` samples on, past the peak's decay."""
    assert skip >= 1, "a skip of 0 would find the same peak forever"
    above = np.flatnonzero(data > threshold)
    peaks: list[int] = []
    position = 0
    while position < len(above):
        peak = int(above[position])
        peaks.append(peak)
        position = int(np.searchsorted(above, peak + skip, side="left"))
    return peaks


def find_peaks(data: NDArray[np.float64], sample_rate: float) -> list[int]:
    """The peaks at the highest threshold that finds enough of them, or none."""
    skip = js_round(PEAK_SKIP_SECONDS * sample_rate)
    for threshold in threshold_ladder():
        peaks = find_peaks_at_threshold(data, threshold, skip)
        if len(peaks) >= MIN_PEAKS:
            return peaks
    return []


def level_reference(data: NDArray[np.float64], sample_rate: float) -> float:
    """The level of a channel's loudest beats, which one click or clipped transient can't set.

    The maxima of its 0.25 s windows, each from 0 so only positive samples count (a NaN one never wins, as in JS),
    sorted, and the one at index floor((windows - 1) * 98 / 100) in whole numbers: not NumPy's interpolating
    `percentile`, which reads another value (conformance/readme.md, The peaks level).
    """
    window = js_round(PEAK_SKIP_SECONDS * sample_rate)
    assert window >= 1, "the analysis refuses a rate under 2 Hz first"
    if len(data) == 0:
        return 0.0
    # One window past the whole input holds the same maximum, and keeps the padding below bounded
    window = min(window, len(data))
    count = -(-len(data) // window)
    positive = np.zeros(count * window, dtype=np.float64)
    positive[: len(data)] = np.where(data > 0, data, 0.0)
    maxima = np.sort(positive.reshape(count, window).max(axis=1))
    return float(maxima[((count - 1) * LEVEL_PERCENTILE) // 100])


def find_peaks_relative_to_level(data: NDArray[np.float64], sample_rate: float) -> list[int]:
    """The fixed ladder again, every rung scaled by the channel's level: none under the floor or at full scale.

    The level is a Python float, so each product and comparison is in double, as in JS. A NumPy float32 level would
    keep `rung * level` in float32 under NumPy 2's promotion rules.
    """
    level = level_reference(data, sample_rate)
    if not (level >= SILENCE_FLOOR and level < 1):
        return []
    skip = js_round(PEAK_SKIP_SECONDS * sample_rate)
    for rung in threshold_ladder():
        peaks = find_peaks_at_threshold(data, rung * level, skip)
        if len(peaks) >= MIN_PEAKS:
            return peaks
    return []


def identify_intervals(peaks: list[int]) -> dict[int, int]:
    """How often each interval occurs between a peak and its next 9, in the order first met: ties keep that order."""
    counts: dict[int, int] = {}
    for n, peak in enumerate(peaks):
        for other in peaks[n + 1 : n + MAX_INTERVAL_COMPARISONS]:
            interval = other - peak
            counts[interval] = counts.get(interval, 0) + 1
    return counts


# A whole BPM's votes: their count, and the sum of their unrounded tempos weighted by count
Votes = tuple[int, float]


def _add_vote(groups: dict[int, Votes], tempo: float, count: int) -> None:
    key = js_round(tempo)
    votes_count, weighted_sum = groups.get(key, (0, 0.0))
    groups[key] = (votes_count + count, weighted_sum + (count * tempo))


def group_by_tempo(intervals: dict[int, int], sample_rate: float, tempo_range: TempoRange) -> list[Tempo]:
    """Folds each interval's tempo into the range by octaves and groups the votes by the whole BPM they round to."""
    groups: dict[int, Votes] = {}
    # The same votes seen from across the range's edge, for the exact tempo only
    across_edge: dict[int, Votes] = {}
    low, high = tempo_range.min, tempo_range.max
    for interval, count in intervals.items():
        if interval == 0:
            continue
        folded = 60 / (abs(interval) / sample_rate)
        # Bounded: high >= 2 * low, so each loop ends within one pass of octaves
        while folded < low:
            folded *= 2
        while folded > high:
            folded /= 2
        _add_vote(groups, folded, count)
        if folded * 2 > high:
            _add_vote(across_edge, folded * 2, count)
        if folded / 2 < low:
            _add_vote(across_edge, folded / 2, count)
    return _with_confidence(groups, across_edge)


def _with_confidence(groups: dict[int, Votes], across_edge: dict[int, Votes]) -> list[Tempo]:
    """Each group's score and exact tempo from its ±1 BPM window; the exact tempo also takes the votes across an edge."""
    total = sum(count for count, _ in groups.values())
    tempos: list[Tempo] = []
    for tempo, (count, _) in groups.items():
        keys = (tempo - 1, tempo, tempo + 1)
        window = [groups.get(key) for key in keys]
        folded = window + [across_edge.get(key) for key in keys]
        support = sum(votes[0] for votes in window if votes is not None)
        folded_support = sum(votes[0] for votes in folded if votes is not None)
        weighted_sum = 0.0
        for votes in folded:
            weighted_sum += votes[1] if votes is not None else 0
        tempos.append(Tempo(
            tempo=tempo,
            # A group of zero-count votes has no mean: its whole BPM is all there is
            exact=weighted_sum / folded_support if folded_support > 0 else float(tempo),
            count=count,
            confidence=support / total if total > 0 else 0,
        ))
    return tempos


def detect_peaks(
    samples: NDArray[np.float32], sample_rate: float, tempo_range: TempoRange, frequency: float, q: float
) -> tuple[list[Tempo], bool]:
    """Up to 5 candidates, most votes first, ties in the order they were first met, and whether they are calibrated.

    The flag is False when the peaks were found only relative to the channel's level: the peaks calibration
    never saw such a reading, so its confidence is unmeasured.
    """
    filtered = apply_lowpass(samples.astype(np.float64), sample_rate, frequency, q)
    # Compared as doubles, as JS compares: NumPy would compare a float32 array with a float threshold in float32
    as_doubles = filtered.astype(np.float64)
    peaks = find_peaks(as_doubles, sample_rate)
    calibrated = True
    # Whatever the fixed ladder finds keeps exactly the reading it had. Only a channel it finds no peaks in
    # is searched again relative to its level
    if not peaks:
        peaks = find_peaks_relative_to_level(as_doubles, sample_rate)
        calibrated = False
    tempos = group_by_tempo(identify_intervals(peaks), sample_rate, tempo_range)
    return sorted(tempos, key=lambda tempo: tempo.count, reverse=True)[:MAX_CANDIDATES], calibrated
