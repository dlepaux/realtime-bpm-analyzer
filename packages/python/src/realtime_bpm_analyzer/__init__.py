"""Offline BPM detection with the same readings as the realtime-bpm-analyzer JS library.

The shared conformance vectors (conformance/ in the repository) prove the readings equal. Decoding audio is the
caller's job: pass one channel of samples and its sample rate to `analyze_channel_data`.
"""

from ._analysis import Samples, analyze_channel_data
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

__all__ = [
    "RELATION_TOLERANCE",
    "AudioSpan",
    "Candidate",
    "CandidateRelation",
    "EngineName",
    "InvalidSamplesError",
    "Lowpass",
    "OutOfRangeError",
    "Reading",
    "Samples",
    "TempoRange",
    "analyze_channel_data",
]
