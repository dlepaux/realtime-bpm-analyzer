"""RBA-109: how far ahead the next beat can be predicted from what a live listener has heard.

Fixed before scoring. At each instant `now` (every STEP seconds from START until LEAD before the end):
- the tempo is the engine's latest realtime reading at or before `now` (the `readings` of the job's
  dev file, timed in heard audio seconds), and nothing is predicted before its first reading;
- the curve holds only frames already computed, (i + 1) / 100 <= now, and the tracker runs on the last
  WINDOW seconds of it;
- a line t = a + b k is fitted through the tracked beats of the last FIT seconds (at least 3, else the
  last beat and the engine's period);
- for each lookahead h, the prediction is the first beat of that line at or after now + h, scored
  against the nearest true beat.
"""

import math
from bisect import bisect_left

from beats_tracker import CURVE_DELAY, FRAME_RATE, frame_time, track_frames

START = 6.0
STEP = 0.5
LEAD = 2.0
WINDOW = 8.0
FIT = 4.0
LOOKAHEADS = (0.0, 0.5, 1.0, 2.0, 4.0)


def _reading_at(readings, now):
    tempo = None
    for heard, bpm, _ in readings:
        if heard > now:
            break
        tempo = bpm
    return tempo


def _line(beats, now, bpm):
    recent = [b for b in beats if b >= now - FIT]
    if len(recent) < 3:
        return (beats[-1], 60.0 / bpm) if beats else None
    n = len(recent)
    ks = list(range(n))
    mean_k, mean_t = (n - 1) / 2, sum(recent) / n
    slope = sum((k - mean_k) * (t - mean_t) for k, t in zip(ks, recent)) / sum((k - mean_k) ** 2 for k in ks)
    return mean_t + slope * (n - 1 - mean_k), slope


def _nearest_error(reference, t):
    k = bisect_left(reference, t)
    return min((t - reference[i] for i in (k - 1, k) if 0 <= i < len(reference)), key=abs)


def predictions(curve, readings, truth, end, delay=CURVE_DELAY):
    """Signed errors in seconds per lookahead, and the instants with no prediction"""
    errors = {h: [] for h in LOOKAHEADS}
    missed = 0
    now = START
    first, last = truth[0], truth[-1]
    while now <= end - LEAD:
        bpm = _reading_at(readings, now)
        frames = int(math.floor(now * FRAME_RATE + 1e-9))
        lo = max(0, frames - int(WINDOW * FRAME_RATE))
        beats = [frame_time(lo + i, delay) for i in track_frames(curve[lo:frames], bpm)] if bpm else []
        line = _line(beats, now, bpm) if beats else None
        if line is None:
            missed += 1
        else:
            anchor, period = line
            for h in LOOKAHEADS:
                target = now + h
                if first <= target <= last and period > 0:
                    k = max(0, math.ceil((target - anchor) / period - 1e-9))
                    errors[h].append(_nearest_error(truth, anchor + k * period))
        now += STEP
    return errors, missed
