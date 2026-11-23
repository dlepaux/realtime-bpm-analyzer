"""The Python surface the conformance set doesn't reach: input types, typing of the result, errors, JS rounding."""

from __future__ import annotations

import dataclasses
import math
import re
import sys
import types
from array import array
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from numpy.typing import NDArray

from conftest import input_samples
from realtime_bpm_analyzer import (
    EngineName,
    InvalidSamplesError,
    Lowpass,
    OutOfRangeError,
    Reading,
    Samples,
    TempoRange,
    analyze_channel_data,
)
from realtime_bpm_analyzer._jsmath import js_round

PACKAGE = Path(__file__).resolve().parents[1]
KICK = "kick-120-22k"
RATE = 22050


@pytest.fixture(scope="module")
def kick() -> NDArray[np.float32]:
    return input_samples(KICK)


@pytest.mark.parametrize("engine", ["tempogram", "peaks"])
def test_every_input_type_reads_the_same(kick: NDArray[np.float32], engine: EngineName) -> None:
    expected = analyze_channel_data(kick, RATE, engine=engine)
    as_list = kick.tolist()
    inputs: list[Samples] = [as_list, array("f", as_list), array("d", as_list), kick.astype(np.float64), tuple(as_list)]
    for samples in inputs:
        assert analyze_channel_data(samples, RATE, engine=engine) == expected


def test_a_float64_input_is_read_as_32_bit_floats() -> None:
    # The JS library holds samples in a Float32Array: a value between two floats reads as its float32 neighbour
    rng = np.random.default_rng(7)
    noise = rng.uniform(-1, 1, RATE * 4)
    assert analyze_channel_data(noise, RATE) == analyze_channel_data(noise.astype(np.float32), RATE)


def test_the_reading_is_frozen_and_typed(kick: NDArray[np.float32]) -> None:
    reading = analyze_channel_data(kick, RATE)
    assert isinstance(reading, Reading)
    assert type(reading.bpm) is int
    assert all(type(candidate.bpm) is int for candidate in reading.candidates)
    assert isinstance(reading.candidates, tuple)
    assert reading.candidates[0].relation == "top"
    assert reading.audio.start == 0.0
    assert reading.audio.end == len(kick) / RATE
    with pytest.raises(dataclasses.FrozenInstanceError):
        reading.bpm = 0  # type: ignore[misc]


def test_a_numpy_float32_sample_rate_divides_as_a_double(kick: NDArray[np.float32]) -> None:
    reading = analyze_channel_data(kick[:20000], np.float32(RATE))  # type: ignore[arg-type]
    assert reading is None or reading.audio.end == 20000 / RATE


def test_a_custom_range_has_no_confidence(kick: NDArray[np.float32]) -> None:
    reading = analyze_channel_data(kick, RATE, tempo_range=TempoRange(min=80, max=170))
    assert reading is not None and reading.confidence is None


def test_silence_reads_nothing() -> None:
    assert analyze_channel_data(np.zeros(RATE * 4, dtype=np.float32), RATE) is None
    assert analyze_channel_data(np.zeros(RATE * 4, dtype=np.float32), RATE, engine="peaks") is None


def test_a_float64_past_float32_range_is_refused_as_the_infinity_it_becomes() -> None:
    samples = np.zeros(RATE * 4)
    samples[10] = 1e300
    with pytest.raises(InvalidSamplesError, match="sample 10 is inf"):
        analyze_channel_data(samples, RATE, engine="peaks")


@pytest.mark.parametrize("value", [np.nan, np.inf, -np.inf])
@pytest.mark.parametrize("engine", ["tempogram", "peaks"])
def test_non_finite_samples_raise(value: float, engine: EngineName) -> None:
    # As JS refuses them since 6.2: through the peaks lowpass one turned every later sample into NaN
    samples = np.zeros(RATE * 4, dtype=np.float32)
    samples[200] = value
    with pytest.raises(InvalidSamplesError, match="sample 200 is"):
        analyze_channel_data(samples, RATE, engine=engine)


@pytest.mark.parametrize(
    ("samples", "error"),
    [
        ([], InvalidSamplesError),
        (np.zeros((2, 100), dtype=np.float32), InvalidSamplesError),
        ("not samples", TypeError),
        ([1j, 2j], TypeError),
        # Integer PCM must be scaled first: read unscaled, int16 samples make the peaks engine misread
        (np.full(100, 1000, dtype=np.int16), TypeError),
        (array("h", [1000] * 100), TypeError),
        (np.ones(100, dtype=bool), TypeError),
        (memoryview(np.full(100, 1000, dtype=np.int16)), TypeError),
        ([np.int16(1000)] * 100, TypeError),
        ([0] * 100, TypeError),
    ],
)
def test_unusable_samples_raise(samples: object, error: type[Exception]) -> None:
    with pytest.raises(error):
        analyze_channel_data(samples, RATE)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("kwargs", "rate"),
    [
        ({"engine": "spectral"}, RATE),
        ({"lowpass": Lowpass()}, RATE),
        ({"engine": "peaks", "lowpass": Lowpass(frequency=math.nan)}, RATE),
        ({"engine": "peaks", "lowpass": Lowpass(frequency=0)}, RATE),
        ({"engine": "peaks", "lowpass": Lowpass(q=-759)}, RATE),
        ({"engine": "peaks"}, 400),
        ({"tempo_range": TempoRange(min=90, max=179)}, RATE),
        ({"tempo_range": TempoRange(min=math.inf, max=math.inf)}, RATE),
        ({}, math.nan),
        # The bounds JS has since 6.2: peaks under 2 Hz, a max past 2^31 - 1, and a max / min past a double
        ({"engine": "peaks", "lowpass": Lowpass(frequency=0.5)}, 1.5),
        ({"tempo_range": TempoRange(min=1e-10, max=1e308)}, RATE),
        ({"tempo_range": TempoRange(min=90, max=2**31)}, RATE),
        ({"engine": "peaks", "tempo_range": TempoRange(min=90, max=2**31)}, RATE),
        ({"tempo_range": TempoRange(min=1e-306, max=1000)}, RATE),
        ({"engine": "peaks", "tempo_range": TempoRange(min=1e-306, max=1000)}, RATE),
        ({}, 99.9),
    ],
)
def test_out_of_range_values_raise(kick: NDArray[np.float32], kwargs: dict[str, object], rate: float) -> None:
    with pytest.raises(OutOfRangeError):
        analyze_channel_data(kick, rate, **kwargs)  # type: ignore[arg-type]


TEMPOGRAM_FLOOR = 122.97509238026915
CONSTS = PACKAGE.parent / "realtime-bpm-analyzer" / "src" / "core" / "consts.ts"


def _clicks(rate: float, seconds: float) -> NDArray[np.float32]:
    """One-sample clicks at 120 BPM, as the conformance set's impulses inputs: a click a low rate keeps."""
    samples = np.zeros(js_round(seconds * rate), dtype=np.float32)
    beat = 0
    while js_round(beat * 0.5 * rate) < len(samples):
        samples[js_round(beat * 0.5 * rate)] = 0.9
        beat += 1
    return samples


def test_the_tempogram_floor_is_the_js_librarys() -> None:
    match = re.search(r"export const tempogramMinSampleRate = ([0-9.]+);", CONSTS.read_text(encoding="utf-8"))
    assert match is not None
    assert float(match.group(1)) == TEMPOGRAM_FLOOR == 2 * math.sqrt(2) / 0.023


@pytest.mark.parametrize("seconds", [12, 10 / 100])
@pytest.mark.parametrize(
    "rate", [100, 110, 122, math.nextafter(math.nextafter(TEMPOGRAM_FLOOR, 0), 0), math.nextafter(TEMPOGRAM_FLOOR, 0)]
)
def test_the_tempogram_refuses_rates_under_its_floor(rate: float, seconds: float) -> None:
    # Whatever the audio's length: 0.1 s at 100 Hz is 10 samples, which would otherwise read None
    message = (
        f"Invalid sample rate: {float(rate)}. The tempogram needs at least 122.97509238026915 Hz, "
        "the lowest rate at which its FFT has a bin above DC."
    )
    with pytest.raises(OutOfRangeError) as raised:
        analyze_channel_data(_clicks(rate, seconds), rate)
    assert str(raised.value) == message


def test_the_tempogram_reads_at_its_floor() -> None:
    assert math.nextafter(TEMPOGRAM_FLOOR, 0) == 122.97509238026913
    reading = analyze_channel_data(_clicks(TEMPOGRAM_FLOOR, 12), TEMPOGRAM_FLOOR)
    assert reading is not None
    assert reading.bpm == 120


@pytest.mark.parametrize(
    ("kwargs", "rate"),
    [
        ({}, "44100"),
        ({}, True),
        ({"tempo_range": (90, 180)}, RATE),
        ({"tempo_range": TempoRange(min="90", max=180)}, RATE),  # type: ignore[arg-type]
        ({"engine": "peaks", "lowpass": {"frequency": 150}}, RATE),
        ({"engine": "peaks", "lowpass": Lowpass(frequency="150")}, RATE),  # type: ignore[arg-type]
    ],
)
def test_wrong_types_raise_type_error(kick: NDArray[np.float32], kwargs: dict[str, object], rate: object) -> None:
    with pytest.raises(TypeError):
        analyze_channel_data(kick, rate, **kwargs)  # type: ignore[arg-type]


def test_options_are_keyword_only(kick: NDArray[np.float32]) -> None:
    with pytest.raises(TypeError):
        analyze_channel_data(kick, RATE, "peaks")  # type: ignore[call-arg]


@pytest.mark.parametrize(
    ("value", "expected"),
    [(2.5, 3), (-2.5, -2), (122.5, 123), (0.49999999999999994, 0), (-0.5, 0), (-0.6, -1), (4503599627370495.5, 4503599627370496)],
)
def test_js_round_sends_halves_up(value: float, expected: int) -> None:
    assert js_round(value) == expected


def test_the_license_is_the_repository_license() -> None:
    # The wheel ships its own copy, since a build can't reach outside packages/python: it must not drift
    assert (PACKAGE / "license.md").read_bytes() == (PACKAGE.parents[1] / "license.md").read_bytes()


def test_the_readme_example_runs(kick: NDArray[np.float32], capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch) -> None:
    # soundfile is the reader's choice, not a dependency: a stand-in returns what soundfile.read returns
    def read(path: str, **options: Any) -> tuple[NDArray[np.float32], int]:
        assert options == {"dtype": "float32", "always_2d": True}
        return kick[:, np.newaxis], RATE

    monkeypatch.setitem(sys.modules, "soundfile", types.SimpleNamespace(read=read))
    readme = (PACKAGE / "readme.md").read_text(encoding="utf-8")
    example = re.search(r"## Example\n.*?```python\n(.*?)```", readme, re.DOTALL)
    assert example is not None
    exec(example.group(1), {})
    reading = analyze_channel_data(kick, RATE)
    assert reading is not None
    assert capsys.readouterr().out.startswith(f"{reading.bpm} BPM, confidence {reading.confidence}\n")
