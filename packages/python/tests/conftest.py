"""The conformance set, loaded once, and the largest deviation each float field showed, printed after the run."""

from __future__ import annotations

import gzip
import hashlib
import json
import sys
from array import array
from functools import cache
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from numpy.typing import NDArray

# The contract lives at the repo root (conformance/readme.md), read in place and never copied
CONFORMANCE = Path(__file__).resolve().parents[3] / "conformance"
SCHEMA_VERSION = 2

# Filled by the conformance tests: field -> (largest absolute deviation, case id)
DEVIATIONS: dict[str, tuple[float, str]] = {}


def record_deviation(field: str, deviation: float, case_id: str) -> None:
    if field not in DEVIATIONS or deviation > DEVIATIONS[field][0]:
        DEVIATIONS[field] = (deviation, case_id)


@cache
def vectors() -> dict[str, Any]:
    data: dict[str, Any] = json.loads((CONFORMANCE / "vectors.json").read_text(encoding="utf-8"))
    return data


@cache
def input_bytes(input_id: str) -> bytes:
    entry = next(item for item in vectors()["inputs"] if item["id"] == input_id)
    return gzip.decompress((CONFORMANCE / entry["file"]).read_bytes())


@cache
def input_samples(input_id: str) -> NDArray[np.float32]:
    """The samples the JS reference analysed: int16 / 32768, exact in a 32-bit float."""
    pcm = array("h", input_bytes(input_id))
    if sys.byteorder == "big":
        pcm.byteswap()
    samples = np.asarray(pcm, dtype=np.float32) / np.float32(32768)
    # 16-bit PCM holds no NaN or infinity, so vectors.json lists those samples for the harness to write in
    entry = next(item for item in vectors()["inputs"] if item["id"] == input_id)
    values = {"NaN": np.nan, "Infinity": np.inf, "-Infinity": -np.inf}
    for sample in entry.get("nonFinite", []):
        assert set(sample) == {"index", "value"} and sample["value"] in values, f"{input_id}: nonFinite {sample}"
        samples[sample["index"]] = values[sample["value"]]
    samples.setflags(write=False)
    return samples


def input_sha256(input_id: str) -> str:
    return hashlib.sha256(input_bytes(input_id)).hexdigest()


def pytest_terminal_summary(terminalreporter: Any) -> None:
    if not DEVIATIONS:
        return
    terminalreporter.section("conformance: largest deviation from the JS reference, by field")
    for field, (deviation, case_id) in sorted(DEVIATIONS.items()):
        terminalreporter.write_line(f"{field}: {deviation:.3g} ({case_id})")


@pytest.fixture(scope="session")
def conformance_vectors() -> dict[str, Any]:
    return vectors()
