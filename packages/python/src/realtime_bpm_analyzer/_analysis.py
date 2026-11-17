"""Whole-input analysis: the checks, in the JS library's order, then the engine, then the reading.

A port of `analyzeChannelData` (packages/realtime-bpm-analyzer/src/node.ts) and of what it calls in
src/core/{offline,engine,tempo,lowpass}.ts.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from numbers import Real
from typing import Any, TypeAlias

import numpy as np
from numpy.typing import NDArray

from ._calibration import calibrate
from ._peaks import MINIMUM_SAMPLE_RATE as PEAKS_MINIMUM_SAMPLE_RATE
from ._peaks import Tempo, detect_peaks
from ._tempogram import MINIMUM_SAMPLE_RATE, detect_tempogram
from ._types import (
    RELATION_TOLERANCE,
    AudioSpan,
    Candidate,
    CandidateRelation,
    EngineName,
    InvalidSamplesError,
    Lowpass,
    OutOfRangeError,
    Reading,
    TempoRange,
)

Samples: TypeAlias = Sequence[float] | NDArray[np.floating[Any]]
"""One channel of floats from -1 to 1: a sequence (a list, a float `array.array`) or a 1-D float NumPy array."""

DEFAULT_TEMPO_RANGE = TempoRange(min=90, max=180)
# The largest tempo_range max, JS's maxTempoRangeBpm: 2^31 - 1, so a whole BPM fits a signed 32-bit integer
MAXIMUM_TEMPO_RANGE_BPM = 2**31 - 1
ENGINES: tuple[EngineName, ...] = ("tempogram", "peaks")
# Where 10^(q/20), Web Audio's 32-bit resonance term, is a normal, finite float (the JS library's qMin and qMax)
Q_MIN = -758
Q_MAX = 770
MAX_CANDIDATES = 5


def _is_number(value: object) -> bool:
    return isinstance(value, Real) and not isinstance(value, bool)


def _as_channel(samples: Samples) -> NDArray[np.float32]:
    """The samples as 32-bit floats, as the JS library holds them: a float64 input is rounded the same way."""
    try:
        channel = np.asarray(samples)
    except (TypeError, ValueError) as error:
        raise TypeError("samples must be a sequence of floats or a NumPy array") from error
    # Integer PCM (int16, say) would read as samples far outside -1 to 1, which the peaks engine misreads. The JS
    # library takes only a Float32Array, so any integer input is refused, whatever holds it, rather than read unscaled
    if channel.dtype.kind != "f":
        raise TypeError(f"samples must be floats from -1 to 1, not {channel.dtype}: scale integer PCM first (int16 / 32768)")
    if channel.ndim != 1:
        raise InvalidSamplesError(f"samples must be one channel, a 1-D sequence, not {channel.ndim}-D")
    if channel.size == 0:
        raise InvalidSamplesError("samples must not be empty")
    # A float64 past float32's range becomes infinite, as a Float32Array stores it, and is refused below as JS refuses it
    with np.errstate(over="ignore"):
        channel = channel.astype(np.float32)
    # A NaN or infinite sample is no PCM: through the peaks lowpass it turns every later sample into NaN. The caller
    # can fix its decoding, so it is refused, as the JS library refuses it (RBA-260)
    not_finite = np.flatnonzero(~np.isfinite(channel))
    if not_finite.size > 0:
        index = int(not_finite[0])
        raise InvalidSamplesError(f"Invalid channel data: sample {index} is {channel[index]}, and every sample must be a finite number.")
    return channel


def _sample_rate(value: float) -> float:
    if not _is_number(value):
        raise TypeError(f"sample_rate must be a number, not {type(value).__name__}")
    # A double, as in JS: a NumPy float32 rate would otherwise turn the arithmetic below into float32
    return float(value)


def _tempo_range(tempo_range: TempoRange | None) -> TempoRange:
    """The range, or the default 90 to 180 BPM. Folding moves a tempo by octaves, so it must span one."""
    if tempo_range is None:
        return DEFAULT_TEMPO_RANGE
    if not isinstance(tempo_range, TempoRange):
        raise TypeError(f"tempo_range must be a TempoRange, not {type(tempo_range).__name__}")
    low, high = tempo_range.min, tempo_range.max
    if not (_is_number(low) and _is_number(high)):
        raise TypeError("tempo_range.min and tempo_range.max must be numbers")
    low, high = float(low), float(high)
    if not (math.isfinite(low) and low > 0 and math.isfinite(high) and high > 0):
        raise OutOfRangeError(f"tempo_range min and max must be positive finite numbers (got min={low}, max={high})")
    if high < low * 2:
        raise OutOfRangeError(f"tempo_range max ({high}) must be at least twice min ({low})")
    # The JS library's two bounds (RBA-260): a whole BPM fits a signed 32-bit integer, and the tempogram's grid has a
    # finite size, at most 71,333 tempos for any finite max / min
    if high > MAXIMUM_TEMPO_RANGE_BPM:
        raise OutOfRangeError(f"tempo_range max ({high}) must be at most {MAXIMUM_TEMPO_RANGE_BPM} BPM")
    if not math.isfinite(high / low):
        raise OutOfRangeError(f"tempo_range max / min ({high} / {low}) is too large, past the largest finite number")
    return TempoRange(min=low, max=high)


def _finite_setting(name: str, value: float) -> float:
    if not _is_number(value):
        raise TypeError(f"lowpass.{name} must be a number, not {type(value).__name__}")
    if not math.isfinite(value):
        raise OutOfRangeError(f"lowpass.{name} {value} is not a finite number")
    return float(value)


def _lowpass(lowpass: Lowpass | None, sample_rate: float) -> tuple[float, float]:
    """The cutoff and Q, checked as the JS library checks every lowpass path."""
    settings = Lowpass() if lowpass is None else lowpass
    if not isinstance(settings, Lowpass):
        raise TypeError(f"lowpass must be a Lowpass, not {type(settings).__name__}")
    frequency = _finite_setting("frequency", settings.frequency)
    q = _finite_setting("q", settings.q)
    if not (math.isfinite(sample_rate) and sample_rate > 0):
        raise OutOfRangeError(f"Invalid sample rate: {sample_rate}. Sample rate must be positive.")
    nyquist = sample_rate / 2
    # Read as the 32-bit float a Web Audio AudioParam stores, so a cutoff that rounds onto 0 or Nyquist is refused
    with np.errstate(over="ignore"):
        stored = float(np.float32(frequency))
    if not (0 < stored < nyquist):
        raise OutOfRangeError(
            f"lowpass.frequency {frequency} is out of range: at {sample_rate} Hz it must be above 0 and below {nyquist} Hz"
        )
    if q < Q_MIN or q > Q_MAX:
        raise OutOfRangeError(f"lowpass.q {q} is out of range: it must be from {Q_MIN} to {Q_MAX} dB")
    return frequency, q


def _relation_to(top: int, bpm: int) -> CandidateRelation:
    def near(target: float) -> bool:
        return abs(bpm - target) <= target * RELATION_TOLERANCE

    if near(top / 2):
        return "half"
    return "double" if near(top * 2) else "other"


def _to_reading(
    tempos: list[Tempo], audio: AudioSpan, engine: EngineName, tempo_range: TempoRange, calibrated: bool
) -> Reading | None:
    """The reading, its confidence None when `calibrated` is False: a peaks file read relative to its level (RBA-221)."""
    if not tempos:
        return None
    top = tempos[0]
    candidates = tuple(
        Candidate(bpm=tempo.tempo, relation="top" if index == 0 else _relation_to(top.tempo, tempo.tempo))
        for index, tempo in enumerate(tempos[:MAX_CANDIDATES])
    )
    return Reading(
        bpm=top.tempo,
        bpm_exact=top.exact,
        confidence=calibrate(engine, top.confidence, top.tempo, tempo_range) if calibrated else None,
        candidates=candidates,
        audio=audio,
        engine=engine,
    )


def analyze_channel_data(
    samples: Samples,
    sample_rate: float,
    *,
    engine: EngineName = "tempogram",
    tempo_range: TempoRange | None = None,
    lowpass: Lowpass | None = None,
) -> Reading | None:
    """Detects the tempo of one channel of decoded audio, as the JS library's `analyzeChannelData` does.

    Args:
        samples: The samples of one channel, from -1 to 1: a list, an `array.array` or a 1-D NumPy array. They are
            analysed as 32-bit floats, as the JS library holds them. Decoding a file is the caller's job.
        sample_rate: Their rate in Hz. The tempogram needs at least 100 Hz.
        engine: `"tempogram"` (the default) reads the full band; `"peaks"` counts intervals between bass peaks.
        tempo_range: The tempos a reading is reported in, 90 to 180 BPM by default. Any other range, even one
            holding 90 to 180, leaves `confidence` None: it was calibrated on the default range only.
        lowpass: The `peaks` engine's lowpass, 200 Hz and 1 dB by default. Only `peaks` takes one.

    Returns:
        The reading, or None when no tempo was found: silence, noise, or under 1.5 s for the tempogram.

    Raises:
        InvalidSamplesError: The samples are empty, not one channel, or hold a NaN or infinite sample.
        OutOfRangeError: The sample rate is not finite and positive (at least 100 Hz for the tempogram, 2 Hz for
            peaks), the engine is unknown, a lowpass is given to the tempogram, the tempo range's bounds are not
            positive and finite, span less than an octave, put max above 2^31 - 1 or overflow max / min, or a
            lowpass setting is not finite, its cutoff not between 0 and half the sample rate, or its Q not from -758
            to 770 dB.
        TypeError: An argument has the wrong type, or the samples are integers.
    """
    channel = _as_channel(samples)
    rate = _sample_rate(sample_rate)
    # The engine, its lowpass and the peaks floor first, then the range, then the tempogram's sample rate: the JS
    # library's order, so a call with two faults fails on the same one
    if engine not in ENGINES:
        raise OutOfRangeError(f"Invalid engine: {engine!r}. Use 'tempogram' or 'peaks'.")
    if lowpass is not None:
        if engine != "peaks":
            raise OutOfRangeError("Only the peaks engine takes a lowpass")
        _lowpass(lowpass, rate)
    # Below 2 Hz the peak search's skip rounds to 0, and the JS library refuses the rate too (RBA-260)
    if engine == "peaks" and not rate >= PEAKS_MINIMUM_SAMPLE_RATE:
        raise OutOfRangeError(f"Invalid sample rate: {rate}. The peaks engine needs at least {PEAKS_MINIMUM_SAMPLE_RATE} Hz.")
    resolved_range = _tempo_range(tempo_range)

    if engine == "tempogram":
        if not (math.isfinite(rate) and rate >= MINIMUM_SAMPLE_RATE):
            raise OutOfRangeError(f"Invalid sample rate: {rate}. The tempogram needs at least {MINIMUM_SAMPLE_RATE} Hz.")
        frequency = q = math.nan
    else:
        frequency, q = _lowpass(lowpass, rate)
    # The samples are finite by now. NumPy's invalid and overflow warnings stay off, as before RBA-260: JS's arithmetic
    # has no such warnings, and the engines follow it
    with np.errstate(invalid="ignore", over="ignore"):
        if engine == "tempogram":
            tempos, calibrated = detect_tempogram(channel, rate, resolved_range), True
        else:
            tempos, calibrated = detect_peaks(channel, rate, resolved_range, frequency, q)
    # One double division, as in JS: the rate is checked by now
    audio = AudioSpan(start=0.0, end=len(channel) / rate)
    return _to_reading(tempos, audio, engine, resolved_range, calibrated)
