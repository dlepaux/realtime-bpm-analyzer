"""RBA-109: a minimal offline beat tracker on the tempogram engine's own onset curve.

Fresh code after D. Ellis, "Beat tracking by dynamic programming", JNMR 36(1), 2007: the beats are
the path through the onset curve that best trades onset strength against a log-Gaussian penalty on
each gap's departure from the period the engine read. No trained model is used.

Frame times. The curve is `onsetCurve` of src/core/tempogram.ts at 100 Hz: frame i is the raw onset
strength computed once (i + 1) hops of audio are in, from a 1024-sample Hann window that ends there.
The 5-tap smoothing is applied later, in `ingest`, so it is not in this curve. Frame i therefore
describes audio about half a window back: CURVE_DELAY. Groove's MIDI note times, aligned to the audio
within 2 ms, check it on dev: beats_dev.py records each track's best lag and the report prints it.
"""

import math

FRAME_RATE = 100.0
CURVE_DELAY = 512 / 44100
TIGHTNESS = 100.0
STRONG_QUANTILE = 0.9


def frame_time(i, delay=CURVE_DELAY):
    """Audio time, in seconds, that onset frame i describes"""
    return (i + 1) / FRAME_RATE - delay


def _normalised(curve):
    n = len(curve)
    mean = sum(curve) / n
    std = math.sqrt(sum((c - mean) ** 2 for c in curve) / n) or 1.0
    return [c / std for c in curve]


def _local_score(onset, period):
    """The onset curve smoothed by a Gaussian of a 32nd of the period, as in Ellis 2007"""
    sigma = period / 32
    # Ellis spans a whole period each side; past 4 sigma the weights are under 0.04% and change nothing
    half = max(1, math.ceil(4 * sigma))
    kernel = [math.exp(-0.5 * (k / sigma) ** 2) for k in range(-half, half + 1)]
    n = len(onset)
    out = [0.0] * n
    for i in range(n):
        lo, hi = max(0, i - half), min(n, i + half + 1)
        out[i] = sum(onset[j] * kernel[j - i + half] for j in range(lo, hi))
    return out


def _dp(local, period, tightness):
    """Cumulative score and back-links: each beat picks the best predecessor 0.5 to 2 periods back"""
    n = len(local)
    lo, hi = max(1, int(round(period / 2))), int(round(2 * period))
    penalty = [-tightness * math.log(gap / period) ** 2 if gap > 0 else 0.0 for gap in range(hi + 1)]
    score, back = [0.0] * n, [-1] * n
    for i in range(n):
        best, link = 0.0, -1
        for gap in range(lo, min(hi, i) + 1):
            candidate = score[i - gap] + penalty[gap]
            if link < 0 or candidate > best:
                best, link = candidate, i - gap
        score[i] = local[i] + (best if link >= 0 and best > 0 else 0.0)
        back[i] = link if link >= 0 and best > 0 else -1
    return score, back


def _backtrack(score, back, local, period):
    n = len(score)
    tail = max(0, n - int(round(period)))
    i = max(range(tail, n), key=lambda k: score[k])
    path = []
    while i >= 0:
        path.append(i)
        i = back[i]
    path.reverse()
    # Weak beats at the edges are the path running through silence, as librosa trims them
    rms = math.sqrt(sum(v * v for v in local) / len(local)) or 1.0
    strong = [k for k in path if local[k] >= 0.5 * rms]
    if not strong:
        return []
    first, last = path.index(strong[0]), path.index(strong[-1])
    return path[first:last + 1]


def track_frames(curve, bpm, tightness=TIGHTNESS):
    """Beat frames of an onset curve at a tempo, or [] when there is no tempo or curve"""
    if not bpm or bpm <= 0 or len(curve) < 4:
        return []
    period = 60.0 * FRAME_RATE / bpm
    local = _local_score(_normalised(curve), period)
    score, back = _dp(local, period, tightness)
    return _backtrack(score, back, local, period)


def track(curve, bpm, delay=CURVE_DELAY, tightness=TIGHTNESS):
    """Beat times, in seconds of audio"""
    return [frame_time(i, delay) for i in track_frames(curve, bpm, tightness)]


def grid_baseline(curve, bpm, delay=CURVE_DELAY):
    """A fixed grid at the tempo, started on the first frame above the curve's 90th percentile"""
    if not bpm or bpm <= 0 or not curve:
        return []
    threshold = sorted(curve)[int(STRONG_QUANTILE * (len(curve) - 1))]
    start = next(i for i, v in enumerate(curve) if v >= threshold)
    period = 60.0 * FRAME_RATE / bpm
    count = int((len(curve) - 1 - start) / period) + 1
    return [frame_time(start + k * period, delay) for k in range(count)]
