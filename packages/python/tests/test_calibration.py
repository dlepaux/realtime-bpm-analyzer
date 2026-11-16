"""The calibration tables must be the JS library's. The vectors read only a few stretches of each table, so this
compares every point with packages/realtime-bpm-analyzer/src/core/calibration.ts, where they are regenerated."""

from __future__ import annotations

import re
from pathlib import Path

from realtime_bpm_analyzer._calibration import CALIBRATION, MEASURED_TEMPO_RANGE

SOURCE = Path(__file__).resolve().parents[2] / "realtime-bpm-analyzer" / "src" / "core" / "calibration.ts"
TOKEN = re.compile(r"\b(tempogram|peaks|all|from90|from140|from165):|\[([0-9.]+), ([0-9.]+)\]")


def js_tables() -> dict[str, dict[str, tuple[tuple[float, float], ...]]]:
    text = SOURCE.read_text(encoding="utf-8")
    body = text[text.index("export const CALIBRATION") : text.index("});", text.index("export const CALIBRATION"))]
    tables: dict[str, dict[str, list[tuple[float, float]]]] = {}
    engine = table = ""
    for match in TOKEN.finditer(body):
        name, raw, calibrated = match.groups()
        if name in ("tempogram", "peaks"):
            engine = name
            tables[engine] = {}
        elif name is not None:
            table = name
            tables[engine][table] = []
        else:
            tables[engine][table].append((float(raw), float(calibrated)))
    return {engine: {name: tuple(points) for name, points in by_name.items()} for engine, by_name in tables.items()}


def test_tables_equal_the_js_library() -> None:
    assert CALIBRATION == js_tables()


def test_measured_range_equals_the_js_library() -> None:
    text = SOURCE.read_text(encoding="utf-8")
    assert "MEASURED_TEMPO_RANGE: Readonly<{min: number; max: number}> = Object.freeze({min: 90, max: 180})" in text
    assert (MEASURED_TEMPO_RANGE.min, MEASURED_TEMPO_RANGE.max) == (90, 180)
