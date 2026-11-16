"""The shared conformance set (conformance/readme.md): every case must read as the JS reference reads it.

The harness is strict on purpose. A key it doesn't know, in the options or in the expected reading, fails the case,
since a case it can't map is a case it can't run. Only `bpmExact` and a numeric `confidence` have a tolerance, read
from vectors.json; every other field is compared exactly.
"""

from __future__ import annotations

from typing import Any

import pytest

from conftest import (
    SCHEMA_VERSION,
    input_samples,
    input_sha256,
    record_deviation,
    vectors,
)
from realtime_bpm_analyzer import (
    InvalidSamplesError,
    Lowpass,
    OutOfRangeError,
    Reading,
    TempoRange,
    analyze_channel_data,
)

OPTION_KEYS = {"engine", "tempoRange"}
ENGINE_KEYS = {"name", "lowpass"}
LOWPASS_KEYS = {"frequency", "q"}
RANGE_KEYS = {"min", "max"}
EXPECTED_KEYS = {"bpm", "bpmExact", "confidence", "candidates", "audio", "engine"}
CANDIDATE_KEYS = {"bpm", "relation"}
AUDIO_KEYS = {"from", "to", "contextTime"}
ERROR_CASE_KEYS = {"id", "input", "sampleRate", "options", "expectedError", "why"}
CASE_KEYS = {"id", "input", "sampleRate", "options", "expected"}
INPUT_KEYS = {"id", "file", "sampleRate", "samples", "sha256", "description"}
# A tolerance kind this harness doesn't apply (a relative one, say) must fail rather than be skipped
TOLERANCE_KEYS = {"absolute", "referenceSpread"}

# Each JS error category maps to exactly one exception type (conformance/readme.md, errorCases)
ERRORS: dict[str, type[Exception]] = {"Error": InvalidSamplesError, "RangeError": OutOfRangeError}


def assert_keys(where: str, value: dict[str, Any], known: set[str]) -> None:
    unknown = set(value) - known
    assert not unknown, f"{where}: unknown keys {sorted(unknown)}, so this harness can't run it"


def to_kwargs(case_id: str, options: dict[str, Any]) -> dict[str, Any]:
    """The case's JS options as this port's keyword arguments, refusing any key it doesn't know."""
    assert_keys(f"{case_id} options", options, OPTION_KEYS)
    kwargs: dict[str, Any] = {}
    engine = options.get("engine")
    if isinstance(engine, str):
        kwargs["engine"] = engine
    elif isinstance(engine, dict):
        assert_keys(f"{case_id} engine", engine, ENGINE_KEYS)
        kwargs["engine"] = engine["name"]
        if "lowpass" in engine:
            assert_keys(f"{case_id} lowpass", engine["lowpass"], LOWPASS_KEYS)
            kwargs["lowpass"] = Lowpass(**engine["lowpass"])
    elif engine is not None:
        pytest.fail(f"{case_id}: engine {engine!r} has no mapping")
    if "tempoRange" in options:
        assert_keys(f"{case_id} tempoRange", options["tempoRange"], RANGE_KEYS)
        kwargs["tempo_range"] = TempoRange(**options["tempoRange"])
    return kwargs


def within(field: str, actual: float, expected: float, case_id: str) -> None:
    tolerance = vectors()["tolerances"][field]["absolute"]
    deviation = abs(actual - expected)
    record_deviation(field, deviation, case_id)
    assert deviation <= tolerance, f"{case_id} {field}: {actual!r}, expected {expected!r} ±{tolerance}"


def exact(field: str, actual: object, expected: object, case_id: str) -> None:
    assert actual == expected, f"{case_id} {field}: {actual!r}, expected {expected!r}"
    # Python compares 120 == 120.0: the type must hold too, so an integer field is never a float here
    assert type(actual) is type(expected) or isinstance(expected, float), f"{case_id} {field}: type {type(actual)}"


def compare(case_id: str, reading: Reading | None, expected: dict[str, Any] | None) -> None:
    if expected is None:
        assert reading is None, f"{case_id}: a reading of {reading}, expected none"
        return
    assert reading is not None, f"{case_id}: no reading, expected {expected['bpm']} BPM"
    assert_keys(f"{case_id} expected", expected, EXPECTED_KEYS)
    assert_keys(f"{case_id} expected.audio", expected["audio"], AUDIO_KEYS)

    exact("bpm", reading.bpm, expected["bpm"], case_id)
    within("bpmExact", reading.bpm_exact, expected["bpmExact"], case_id)
    if expected["confidence"] is None:
        assert reading.confidence is None, f"{case_id} confidence: {reading.confidence}, expected null"
    else:
        assert reading.confidence is not None, f"{case_id} confidence: null, expected {expected['confidence']}"
        within("confidence", reading.confidence, expected["confidence"], case_id)

    for candidate in expected["candidates"]:
        assert_keys(f"{case_id} candidate", candidate, CANDIDATE_KEYS)
    assert len(reading.candidates) == len(expected["candidates"]), f"{case_id} candidates: {reading.candidates}"
    for index, (actual, wanted) in enumerate(zip(reading.candidates, expected["candidates"])):
        exact(f"candidates[{index}].bpm", actual.bpm, wanted["bpm"], case_id)
        exact(f"candidates[{index}].relation", actual.relation, wanted["relation"], case_id)

    exact("audio.from", reading.audio.start, float(expected["audio"]["from"]), case_id)
    exact("audio.to", reading.audio.end, float(expected["audio"]["to"]), case_id)
    # The port has no audio context, so its readings carry no context time: the reference's must be null too
    assert expected["audio"]["contextTime"] is None, f"{case_id}: a context time this port can't report"
    exact("engine", reading.engine, expected["engine"], case_id)


def test_schema_version_is_one_this_harness_knows() -> None:
    assert vectors()["schemaVersion"] == SCHEMA_VERSION


def test_top_level_keys_are_known() -> None:
    assert_keys("vectors.json", vectors(), {"schemaVersion", "pcm", "tolerances", "inputs", "cases", "errorCases"})
    assert vectors()["pcm"] == {
        "encoding": "signed 16-bit little-endian",
        "channels": 1,
        "compression": "gzip",
        "divisor": 32768,
    }
    assert set(vectors()["tolerances"]) == {"bpmExact", "confidence"}
    for field, tolerance in vectors()["tolerances"].items():
        assert_keys(f"tolerances.{field}", tolerance, TOLERANCE_KEYS)


@pytest.mark.parametrize("entry", vectors()["inputs"], ids=lambda entry: entry["id"])
def test_input_decodes_to_the_reference_samples(entry: dict[str, Any]) -> None:
    assert_keys(entry["id"], entry, INPUT_KEYS)
    assert input_sha256(entry["id"]) == entry["sha256"]
    assert len(input_samples(entry["id"])) == entry["samples"]


@pytest.mark.parametrize("case", vectors()["cases"], ids=lambda case: case["id"])
def test_case_reads_as_the_reference(case: dict[str, Any]) -> None:
    assert_keys(case["id"], case, CASE_KEYS)
    reading = analyze_channel_data(
        input_samples(case["input"]),
        case["sampleRate"],
        **to_kwargs(case["id"], case["options"]),
    )
    compare(case["id"], reading, case["expected"])


@pytest.mark.parametrize("case", vectors()["errorCases"], ids=lambda case: case["id"])
def test_error_case_raises_its_category(case: dict[str, Any]) -> None:
    assert_keys(case["id"], case, ERROR_CASE_KEYS)
    assert case["expectedError"] in ERRORS, f"{case['id']}: no mapping for {case['expectedError']}"
    expected = ERRORS[case["expectedError"]]
    with pytest.raises(Exception) as raised:
        analyze_channel_data(
            input_samples(case["input"]),
            case["sampleRate"],
            **to_kwargs(case["id"], case["options"]),
        )
    # Exactly that type: the two categories share ValueError as a base, so pytest.raises alone would accept either
    assert type(raised.value) is expected, f"{case['id']}: raised {type(raised.value).__name__}"

