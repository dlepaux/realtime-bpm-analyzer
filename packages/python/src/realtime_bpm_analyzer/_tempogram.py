"""The `tempogram` engine, whole-input path: band-wise onset strength, its autocorrelation read through a comb on a
tempo grid, a log-Gaussian tempo prior, and every frame's salience accumulated with the same weight.

A port of packages/realtime-bpm-analyzer/src/core/tempogram.ts (`detectTempogram`). The realtime detector's
stability rule decides only when a live reading is shown, so it has no part here. NumPy runs the per-frame FFTs and
logarithms; the recurrences (loudness, local means) and the small tempo grid run in Python, in the reference's order.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view
from numpy.typing import NDArray

from ._jsmath import js_round
from ._peaks import Tempo
from ._types import OutOfRangeError, TempoRange

# The tuning the JS library ships (defaultTempogramTuning), with the half-life whole-input analysis sets
FRAME_RATE = 100
BANDS = (30, 200, 500, 1500, 4000, 10_000)
COMPRESSION = 1000
LOCAL_MEAN_SECONDS = 0.5
WINDOW_SECONDS = 8
WARMUP_SECONDS = 4
UPDATE_SECONDS = 0.5
COMB_BEATS = 4
HALF_LIFE_SECONDS = math.inf
HALF_BEAT_PENALTY = 0
THIRD_BEAT_PENALTY = 0.3
PRIOR_BPM = 80
PRIOR_OCTAVES = 1.7
READING_SALIENCE = 0.02

GRID_RATIO = 1.01
LOUDNESS_DECAY = 0.9995
MINIMUM_LOUDNESS = 0.05
SMOOTHING_WEIGHTS = (1 / 9, 2 / 9, 3 / 9, 2 / 9, 1 / 9)
MAX_CANDIDATES = 5
SHORTEST_RECORDING_SECONDS = 1.5
MINIMUM_SAMPLE_RATE = FRAME_RATE
# Frames transformed at once: bounds the memory a long input takes, about 8 MB at 44.1 kHz
_FRAME_BLOCK = 1024


@dataclass(frozen=True, slots=True)
class _Grid:
    tempos: list[float]
    prior: list[float]
    # For each tempo, each beat multiple: the lag in frames
    lags: list[list[float]]
    max_lag: int


def _tempo_grid(tempo_range: TempoRange, frame_rate: float, window_frames: int) -> _Grid:
    ratio = tempo_range.max / tempo_range.min
    # An overflowing ratio makes the JS grid an array of Infinity entries, which JS refuses with a RangeError
    if not math.isfinite(ratio):
        raise OutOfRangeError(f"tempo_range spans too much: max / min ({tempo_range.max} / {tempo_range.min}) overflows")
    size = math.floor(math.log(ratio) / math.log(GRID_RATIO)) + 1
    tempos: list[float] = []
    prior: list[float] = []
    lags: list[list[float]] = []
    max_lag = 0.0
    for i in range(size):
        tempo = tempo_range.min * (GRID_RATIO**i)
        tempos.append(tempo)
        prior.append(math.exp(-0.5 * ((math.log2(tempo / PRIOR_BPM) / PRIOR_OCTAVES) ** 2)))
        row = [((k + 1) * 60 * frame_rate) / tempo for k in range(COMB_BEATS)]
        lags.append(row)
        for lag in row:
            max_lag = lag if lag < window_frames - 1 and lag > max_lag else max_lag
    return _Grid(tempos, prior, lags, math.ceil(max_lag) + 1)


def _onset_strengths(samples: NDArray[np.float64], sample_rate: float, hop: int, frame_rate: float) -> NDArray[np.float64]:
    """One onset strength per hop: the positive band-wise rise of log-compressed spectra, less each band's local mean."""
    fft_size = 2 ** js_round(math.log2(0.023 * sample_rate))
    bins = fft_size // 2
    nyquist = sample_rate / 2
    edges = [min(bins, max(1, js_round((hz / nyquist) * bins))) for hz in BANDS]
    low, high = edges[0], edges[-1]
    mean_step = 1 / (LOCAL_MEAN_SECONDS * frame_rate)
    # Periodic Hann (divided by N, not N - 1): the reference's, and a symmetric one fails the vectors
    hann = 0.5 - (0.5 * np.cos((2 * math.pi * np.arange(fft_size)) / fft_size))
    frames = len(samples) // hop
    # Frame j sees the fft_size samples before sample j * hop, zeros before the input starts, as the ring does
    windows = sliding_window_view(np.concatenate((np.zeros(fft_size), samples)), fft_size)[hop : frames * hop + 1 : hop]

    onset = np.zeros(frames)
    loudness = MINIMUM_LOUDNESS
    previous_log = np.zeros(high - low)
    local_means = [0.0] * (len(edges) - 1)
    has_previous = False
    for block_start in range(0, frames, _FRAME_BLOCK):
        spectrum = np.fft.rfft(windows[block_start : block_start + _FRAME_BLOCK] * hann, axis=1)[:, :bins]
        power = (spectrum.real * spectrum.real) + (spectrum.imag * spectrum.imag)
        totals = power[:, 1:].sum(axis=1)
        peaks = power[:, 1:].max(axis=1, initial=0.0)
        rows: list[int] = []
        scales: list[float] = []
        for row, total in enumerate(totals.tolist()):
            # A NaN or infinite sample is no audio: no onset, and the state is kept, as the reference keeps it
            if not math.isfinite(total):
                continue
            loudness = max(math.sqrt(float(peaks[row])), loudness * LOUDNESS_DECAY, MINIMUM_LOUDNESS)
            rows.append(row)
            scales.append(COMPRESSION / loudness)
        if not rows:
            continue
        logs = np.log(1 + (np.asarray(scales)[:, None] * np.sqrt(power[rows, low:high])))
        rises = np.diff(np.vstack((previous_log, logs)), axis=0)
        previous_log = logs[-1]
        positive = np.where(rises > 0, rises, 0.0)
        fluxes = [
            positive[:, first - low : end - low].sum(axis=1) / max(1, end - first)
            for first, end in zip(edges, edges[1:])
        ]
        for index, row in enumerate(rows):
            strength = 0.0
            for band, flux_by_row in enumerate(fluxes):
                flux = float(flux_by_row[index])
                local_means[band] += mean_step * (flux - local_means[band])
                novelty = flux - local_means[band]
                strength += novelty if novelty > 0 else 0
            # The first frame rises from nothing, which is no onset
            onset[block_start + row] = strength if has_previous else 0.0
            has_previous = True
    return onset


def _smoothed(onset: NDArray[np.float64]) -> NDArray[np.float64]:
    """The 50 ms smoothing, summed in the reference's order, then stored as 32-bit floats as its ring stores them."""
    smoothed = onset * SMOOTHING_WEIGHTS[0]
    for delay, weight in enumerate(SMOOTHING_WEIGHTS[1:], start=1):
        smoothed = smoothed + (np.concatenate((np.zeros(delay), onset))[: len(onset)] * weight)
    return smoothed.astype(np.float32).astype(np.float64)


class _Accumulator:
    """The tempo state across tempogram frames: the autocorrelation buffer, the accumulated salience, the ranking."""

    def __init__(self, grid: _Grid) -> None:
        self.grid = grid
        # Kept across frames: a lag past this frame's end reads what an earlier frame left, as in the reference
        self.autocorrelation = [0.0] * (grid.max_lag + 1)
        self.accumulated = [0.0] * len(grid.tempos)
        self.ranking = [0.0] * len(grid.tempos)
        self.weight = 0.0
        self.memory = 0.5 ** (UPDATE_SECONDS / HALF_LIFE_SECONDS)

    def _correlation_at(self, lag: float) -> float:
        low = math.floor(lag)
        # Past the buffer the reference reads undefined, which is NaN: a NaN penalty then counts as none
        if low + 1 >= len(self.autocorrelation):
            return math.nan
        values = self.autocorrelation
        return values[low] + ((lag - low) * (values[low + 1] - values[low]))

    def _salience(self, window: NDArray[np.float64]) -> list[float] | None:
        """Each tempo's comb over the window's autocorrelation, or None when nothing pulses in it."""
        length = len(window)
        # cumsum adds left to right, as the reference's loops do, so these sums are the reference's own
        mean = float(np.cumsum(window)[-1]) / length
        centred = window - mean
        lag_end = min(self.grid.max_lag, length - 1)
        for shift in range(lag_end + 1):
            total = float(np.cumsum(centred[shift:] * centred[: length - shift])[-1])
            # Unbiased: a long lag overlaps less, which must not read as less periodic
            self.autocorrelation[shift] = (total * length) / (length - shift)
        energy = self.autocorrelation[0]
        if energy < 1e-12:
            return None
        salience: list[float] = []
        for row in self.grid.lags:
            comb_sum = 0.0
            teeth = 0
            for lag in row:
                if lag >= lag_end:
                    break
                comb_sum += self._correlation_at(lag)
                teeth += 1
            comb = comb_sum / (teeth * energy) if teeth > 0 else 0
            beat = row[0]
            between = (HALF_BEAT_PENALTY * self._correlation_at(beat / 2)) + (
                THIRD_BEAT_PENALTY * self._correlation_at(beat / 3)
            )
            salience.append(comb - ((between if between > 0 else 0) / energy))
        return salience

    def add_frame(self, window: NDArray[np.float64]) -> None:
        salience = self._salience(window)
        if salience is None:
            return
        self.weight = (self.weight * self.memory) + 1
        for i, value in enumerate(salience):
            self.accumulated[i] = (self.accumulated[i] * self.memory) + (value if value > 0 else 0)
            self.ranking[i] = (self.accumulated[i] / self.weight) * self.grid.prior[i]

    def _refined_tempo(self, i: int) -> float:
        """The grid tempo moved to the vertex of the parabola through its ranking and its neighbours'."""
        ranking = self.ranking
        if i == 0 or i == len(ranking) - 1:
            return self.grid.tempos[i]
        denominator = ranking[i - 1] - (2 * ranking[i]) + ranking[i + 1]
        offset: float = 0 if denominator == 0 else (0.5 * (ranking[i - 1] - ranking[i + 1])) / denominator
        return self.grid.tempos[i] * float(GRID_RATIO**offset)

    def candidates(self) -> list[Tempo]:
        ranking = self.ranking
        last = len(ranking) - 1
        peaks = [
            i
            for i, value in enumerate(ranking)
            if value > 0
            and (i == 0 or value >= ranking[i - 1])
            and (i == last or value >= ranking[i + 1])
        ]
        # Stable: equal rankings keep grid order, as the reference's sort keeps it
        ranked = sorted(peaks, key=lambda i: ranking[i], reverse=True)[:MAX_CANDIDATES]
        tempos: list[Tempo] = []
        for i in ranked:
            exact = self._refined_tempo(i)
            confidence = min(1, self.accumulated[i] / self.weight)
            if confidence >= READING_SALIENCE:
                tempos.append(Tempo(js_round(exact), exact, js_round(ranking[i] * 1000), confidence))
        return tempos


def detect_tempogram(samples: NDArray[np.float32], sample_rate: float, tempo_range: TempoRange) -> list[Tempo]:
    """Up to 5 candidates, best first, empty when no pulse stands out. The sample rate is at least 100 Hz."""
    seconds = len(samples) / sample_rate
    # Shorter audio has no two beats to compare at the slowest tempo searched
    if seconds < SHORTEST_RECORDING_SECONDS:
        return []
    hop = js_round(sample_rate / FRAME_RATE)
    frame_rate = sample_rate / hop
    window_frames = js_round(WINDOW_SECONDS * frame_rate)
    update_frames = max(1, js_round(UPDATE_SECONDS * frame_rate))
    # A frame short of the end: rounding must not ask for more frames than the input holds
    warmup_frames = js_round(min(WARMUP_SECONDS, seconds - (1 / FRAME_RATE)) * frame_rate)

    oss = _smoothed(_onset_strengths(samples.astype(np.float64), sample_rate, hop, frame_rate))
    state = _Accumulator(_tempo_grid(tempo_range, frame_rate, window_frames))
    # The reference reads a tempogram frame once `frames`, counted from 1, reaches the warm-up, then every update
    first = warmup_frames if warmup_frames >= 1 else update_frames
    for frames in range(first, len(oss) + 1, update_frames):
        state.add_frame(oss[max(0, frames - window_frames) : frames])
    return state.candidates()
