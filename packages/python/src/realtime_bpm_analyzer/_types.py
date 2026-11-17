"""The public value types and exceptions: the JS library's `Reading`, its options and its two error categories."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

EngineName = Literal["tempogram", "peaks"]
"""`tempogram` (the default) reads the full band; `peaks` counts the intervals between bass peaks."""

CandidateRelation = Literal["top", "half", "double", "other"]
"""How a candidate relates to the reading's tempo. May grow in a minor release, as in JS."""

RELATION_TOLERANCE = 0.02
"""Relative tolerance for `half` and `double`: within 2% of the exact ratio."""


class InvalidSamplesError(ValueError):
    """The samples can't be analysed: none at all, or not one channel. JS throws an `Error` for these."""


class OutOfRangeError(ValueError):
    """A value is outside its valid range: the sample rate, the tempo range, the engine or a lowpass setting.

    JS throws a `RangeError` for these.
    """


@dataclass(frozen=True, slots=True)
class TempoRange:
    """The tempos a reading is reported in, in BPM, both included. `max` must be at least twice `min`."""

    min: float
    max: float


@dataclass(frozen=True, slots=True)
class Lowpass:
    """The `peaks` engine's lowpass: the cutoff in Hz, below half the sample rate, and the resonance in dB."""

    frequency: float = 200
    q: float = 1


@dataclass(frozen=True, slots=True)
class Candidate:
    """A tempo the engine considered, in its rank order."""

    bpm: int
    relation: CandidateRelation


@dataclass(frozen=True, slots=True)
class AudioSpan:
    """The span analysed, in seconds: always the whole input. JS calls these `from` and `to`.

    JS's `contextTime` has no equivalent here: it is a Web Audio clock, and whole-input analysis sets it to null.
    """

    start: float
    end: float


@dataclass(frozen=True, slots=True)
class Reading:
    """A tempo reading, with the same fields and the same meaning as the JS library's `Reading`."""

    bpm: int
    """The tempo, a whole BPM inside the tempo range. Equal to `candidates[0].bpm`."""
    bpm_exact: float
    """The same tempo, unrounded."""
    confidence: float | None
    """The chance, 0 to 1, that `bpm` is right. None when unmeasured: the reading's `bpm` is outside 90 to 180 BPM,
    or the analysis ran on any tempo range other than 90 to 180, or the peaks engine found the beats only relative to
    a quiet or bass-light input's own level, which input may hold no beat at all."""
    candidates: tuple[Candidate, ...]
    """1 to 5 tempos in the engine's rank order, the first with relation `top`."""
    audio: AudioSpan
    engine: EngineName
