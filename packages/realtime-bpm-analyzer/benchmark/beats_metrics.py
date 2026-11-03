"""RBA-109: standard beat-tracking metrics, reimplemented on the standard library.

The definitions follow mir_eval.beat (MIT), which follows Dixon 2007 for the F-measure and
Hainsworth 2004 and Klapuri et al. 2006 for continuity, as summarised by Davies, Degara and Plumbley,
"Evaluation methods for musical audio beat tracking algorithms", QMUL C4DM-TR-09-06, 2009. They are
written here rather than imported because the box that holds the data has no numpy. Like mir_eval's
evaluate(), callers drop beats before 5 s first (`trim`), as listeners and trackers both need a few
beats to settle.
"""

from bisect import bisect_left

F_WINDOW = 0.07
# One video frame at 25 fps, the editing use's bar from RBA-109's brief, reported beside the standard 70 ms
FRAME_WINDOW = 0.04
CONTINUITY_THRESHOLD = 0.175
TRIM_SECONDS = 5.0


def trim(beats, start=TRIM_SECONDS):
    return [b for b in beats if b >= start]


def f_measure(reference, estimated, window=F_WINDOW):
    """Share of beats matched one to one within +-window, as an F-measure. Both lists sorted."""
    if not reference and not estimated:
        return 1.0
    if not reference or not estimated:
        return 0.0
    matched = _greedy_matches(reference, estimated, window)
    precision = matched / len(estimated)
    recall = matched / len(reference)
    return 0.0 if matched == 0 else 2 * precision * recall / (precision + recall)


def _greedy_matches(reference, estimated, window):
    # In one dimension, with the window under half a beat, a left-to-right greedy pass is a maximum matching
    i = j = matched = 0
    while i < len(reference) and j < len(estimated):
        gap = estimated[j] - reference[i]
        if abs(gap) <= window:
            matched += 1
            i += 1
            j += 1
        elif gap < 0:
            j += 1
        else:
            i += 1
    return matched


def _interval(reference, k):
    if len(reference) < 2:
        return None
    return reference[k + 1] - reference[k] if k + 1 < len(reference) else reference[k] - reference[k - 1]


def _nearest(reference, t):
    k = bisect_left(reference, t)
    if k == 0:
        return 0
    if k == len(reference):
        return k - 1
    return k if reference[k] - t < t - reference[k - 1] else k - 1


def _correct_flags(reference, estimated, threshold):
    """Per estimated beat: within the phase and the period tolerance of its nearest reference beat"""
    flags = []
    for m, t in enumerate(estimated):
        k = _nearest(reference, t)
        interval = _interval(reference, k)
        phase_ok = abs(t - reference[k]) <= threshold * interval
        if m == 0:
            # The first beat has no previous one: its period is read forward, as mir_eval does
            own = estimated[1] - t if len(estimated) > 1 else None
        else:
            own = t - estimated[m - 1]
        period_ok = own is not None and abs(own - interval) <= threshold * interval
        flags.append(phase_ok and period_ok)
    return flags


def _cml(reference, estimated, threshold):
    """(longest run share, total share) of correct beats, over the larger of the two counts"""
    if len(reference) < 2 or len(estimated) < 2:
        return 0.0, 0.0
    flags = _correct_flags(reference, estimated, threshold)
    longest = run = 0
    for flag in flags:
        run = run + 1 if flag else 0
        longest = max(longest, run)
    denominator = max(len(reference), len(estimated))
    return longest / denominator, sum(flags) / denominator


def _variations(reference):
    """The reference, its off-beats, double, and the two halves (the AML metrical levels)"""
    mids = [(a + b) / 2 for a, b in zip(reference, reference[1:])]
    double = sorted(reference + mids)
    return [reference, mids, double, reference[0::2], reference[1::2]]


def continuity(reference, estimated, threshold=CONTINUITY_THRESHOLD):
    """CMLc, CMLt, AMLc, AMLt, each in 0..1"""
    cml_c, cml_t = _cml(reference, estimated, threshold)
    aml_c = aml_t = 0.0
    for variation in _variations(reference):
        c, t = _cml(variation, estimated, threshold)
        aml_c, aml_t = max(aml_c, c), max(aml_t, t)
    return cml_c, cml_t, aml_c, aml_t


def scores(reference, estimated):
    """The four reported scores, in percent, after trimming the first 5 s of both lists"""
    reference, estimated = trim(reference), trim(estimated)
    _, cml_t, _, aml_t = continuity(reference, estimated)
    return {'F': 100 * f_measure(reference, estimated), 'F40': 100 * f_measure(reference, estimated, FRAME_WINDOW),
            'CMLt': 100 * cml_t, 'AMLt': 100 * aml_t}
