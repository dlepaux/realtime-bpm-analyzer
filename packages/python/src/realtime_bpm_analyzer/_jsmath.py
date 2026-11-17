"""The JS arithmetic the readings depend on, where Python's defaults differ."""

from __future__ import annotations

import math


def js_round(value: float) -> int:
    """JS `Math.round`: halves go towards +infinity, so 2.5 gives 3 and -2.5 gives -2.

    Python's `round` sends halves to the even neighbour (2.5 gives 2), which moves tempos that land exactly on a
    half, such as the peaks engine's 122.5 BPM (conformance/readme.md, Rounding). `floor(x + 0.5)` is not used
    either: the addition itself rounds below 0.5 and above 2^52. `x - floor(x)` is exact for x >= 0 and x <= -1
    (Sterbenz), and between -1 and 0 its rounding can't cross 0.5. The value must be finite.
    """
    floor = math.floor(value)
    return floor + 1 if value - floor >= 0.5 else floor
