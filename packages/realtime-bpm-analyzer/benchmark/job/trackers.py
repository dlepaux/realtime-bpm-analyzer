#!/usr/bin/env python3
"""Independent tempo and key readings for RBA-59's free data. Labelling only: nothing here ships.

Reads a list of audio paths, writes one JSON line per track, and skips ids already written, so a kill
loses at most the tracks in flight.

Trackers and licences, stated because they matter (plan/rba-data-options.md):
- Beat This! 1.1.0, code and weights MIT. Its own readme warns some training files are copyrighted,
  so this is a flagged labelling use for RBA-40. Neural, and the only one without a slow-tempo prior.
- Essentia RhythmExtractor2013 and KeyExtractor, AGPLv3, DSP only. Run as a tool. No NC model is used.
- librosa 1.0.0, ISC. Its tempo estimator with a flat prior, and a chroma template match for a second
  key reading. Beat This! stays the first vote: free-data/consensus.ts relies on that order.
madmom's models and Essentia's TensorFlow models are non-commercial, so they are left out.
"""
import argparse
from concurrent.futures import FIRST_COMPLETED, ProcessPoolExecutor, wait
from concurrent.futures.process import BrokenProcessPool
import json
import multiprocessing
import os
import subprocess
import sys
import tempfile
from collections import Counter, deque
from pathlib import Path

import numpy as np
import scipy.stats

SAMPLE_RATE = 22050
ESSENTIA_RATE = 44100
TOOL_TIMEOUT_SECONDS = 300
# A native crash ends a whole pool, and any track in flight may be the cause. A track is only blamed
# after this many crashes, and past the limit of crashes the job fails rather than blame everything.
STRIKES_TO_REJECT = 3
MOST_POOL_CRASHES = 12
# Centre of the track: intros and outros are where tempo is least defined, and this bounds the cost
EXCERPT_SECONDS = 120

KS_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KS_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# librosa's default prior centres on 120 BPM, which pulls a 170 track to 112. A label for fast music
# cannot come from a tool told to expect slow music, so this one is told nothing.
FLAT_PRIOR = scipy.stats.uniform(40, 200)

_beats = None
_rhythm = None
_key = None


def _setup(checkpoint):
    """Loads each tool once per worker. One thread each: the workers are the parallelism."""
    global _beats, _rhythm, _key
    # Numba's cache on disk is shared by default, and workers compiling librosa's functions at once
    # segfaulted on first use (seen with 4 workers, not with 2). Set before anything imports numba.
    os.environ["NUMBA_CACHE_DIR"] = tempfile.mkdtemp(prefix="numba-")
    import essentia.standard as es
    import torch
    from beat_this.inference import Audio2Beats

    torch.set_num_threads(1)
    _beats = Audio2Beats(checkpoint_path=checkpoint, device="cpu", dbn=False)
    # RhythmExtractor2013 takes 44.1 kHz only, and states no error when fed anything else
    _rhythm = es.RhythmExtractor2013(method="multifeature")
    _key = es.KeyExtractor(profileType="edma", sampleRate=ESSENTIA_RATE)


class Transient(Exception):
    """The machine failed, not the file: the track stays unread, for the next run to read."""


def _run(command):
    try:
        return subprocess.run(command, capture_output=True, check=True, timeout=TOOL_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired as error:
        raise Transient("timed out") from error
    except subprocess.CalledProcessError as error:
        # A negative code is a signal, usually the memory limit, and says nothing about the file
        if error.returncode < 0:
            raise Transient(f"signal {-error.returncode}") from error
        raise


def _duration(path):
    out = _run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path])
    return float(out.stdout.decode().strip())


def _decode(path, start, seconds, rate):
    out = _run(["ffmpeg", "-v", "error", "-nostdin", "-ss", str(start), "-t", str(seconds), "-i", path,
                "-ac", "1", "-ar", str(rate), "-f", "f32le", "-"])
    return np.frombuffer(out.stdout, dtype=np.float32).copy()


def _finite(value):
    """JSON has no NaN, and a reader in another language refuses the whole file over one."""
    return float(value) if value is not None and np.isfinite(value) else None


def _tempo_from_beats(beats):
    """Mean of the intervals near the median. The median alone sits on the 20 ms frame grid, which is
    2 BPM apart at 170, and a plain mean would let one dropped beat move the reading."""
    if len(beats) < 8:
        return None
    intervals = np.diff(beats)
    median = np.median(intervals)
    near = intervals[np.abs(intervals / median - 1) <= 0.1]
    # An even split of two intervals leaves the median near neither: no steady pulse to read
    return float(60.0 / near.mean()) if near.size > 0 else None


def _half_agreement(beats):
    """Whether both halves of the excerpt read one tempo. A false means a tempo change or a lost tracker."""
    if len(beats) < 16:
        return None
    middle = len(beats) // 2
    first, second = _tempo_from_beats(beats[:middle]), _tempo_from_beats(beats[middle:])
    if first is None or second is None:
        return None
    return bool(abs(first / second - 1) <= 0.04)


def _chroma_key(signal):
    import librosa

    chroma = librosa.feature.chroma_cqt(y=signal, sr=SAMPLE_RATE, hop_length=4096).mean(axis=1)
    scores = []
    for tonic in range(12):
        rolled = np.roll(chroma, -tonic)
        scores.append((np.corrcoef(rolled, KS_MAJOR)[0, 1], f"{NOTES[tonic]} major"))
        scores.append((np.corrcoef(rolled, KS_MINOR)[0, 1], f"{NOTES[tonic]} minor"))
    return max(scores)[1]


def analyse(job):
    """One track. An error about the file is a result: the row says why, and the caller rejects it."""
    track_id, path = job
    try:
        import librosa

        duration = _duration(path)
        start = max(0.0, (duration - EXCERPT_SECONDS) / 2)
        signal = _decode(path, start, EXCERPT_SECONDS, SAMPLE_RATE)
        if signal.size < SAMPLE_RATE * 10:
            return {"id": track_id, "error": "under 10 s of audio"}
        full_rate = _decode(path, start, EXCERPT_SECONDS, ESSENTIA_RATE)

        beats, _ = _beats(signal, SAMPLE_RATE)
        essentia_bpm = float(_rhythm(full_rate)[0])
        librosa_bpm = float(np.atleast_1d(librosa.feature.tempo(y=signal, sr=SAMPLE_RATE, prior=FLAT_PRIOR))[0])
        key, scale, strength = _key(full_rate)

        return {
            "id": track_id,
            "duration": duration,
            "votes": [
                {"method": "beat-this-final0", "bpm": _finite(_tempo_from_beats(beats))},
                {"method": "essentia-rhythm2013", "bpm": _finite(essentia_bpm)},
                {"method": "librosa-tempo-flat-prior", "bpm": _finite(librosa_bpm)},
            ],
            "halvesAgree": _half_agreement(beats),
            "keyVotes": [f"{key} {scale}", _chroma_key(signal)],
            "keyStrength": _finite(strength),
        }
    except Transient as error:
        return {"id": track_id, "transient": str(error)}
    except MemoryError:
        return {"id": track_id, "transient": "out of memory"}
    except Exception as error:  # A broken file must not stop thousands of others
        return {"id": track_id, "error": f"{type(error).__name__}: {error}"[:300]}


def _read_done(path):
    """Ids already read, after cutting a line a kill left half written: an append would glue onto it."""
    if not Path(path).exists():
        return set()
    with open(path, "rb+") as handle:
        content = handle.read()
        handle.truncate(content.rfind(b"\n") + 1)
    return {json.loads(line)["id"] for line in content[: content.rfind(b"\n") + 1].splitlines() if line.strip()}


def _check_setup(context, checkpoint):
    """A pool gives no clean answer about a worker that cannot start. Loading in a process of its own
    ends the job at once over a missing checkpoint, and gives that memory back before the workers start."""
    process = context.Process(target=_setup, args=(checkpoint,))
    process.start()
    process.join()
    if process.exitcode != 0:
        raise SystemExit(f"trackers would not load, exit {process.exitcode}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--list", required=True, help="JSON lines of {id, path}")
    parser.add_argument("--out", required=True, help="JSON lines, appended")
    parser.add_argument("--workers", type=int, default=int(os.environ.get("RBA_JOB_WORKERS", "4")))
    parser.add_argument("--checkpoint", default="final0")
    args = parser.parse_args()

    done = _read_done(args.out)
    with open(args.list, encoding="utf8") as handle:
        rows = [json.loads(line) for line in handle if line.strip()]
    jobs = [(row["id"], row["path"]) for row in rows if row["id"] not in done]
    print(f"{len(jobs)} tracks to read, {len(done)} already read", file=sys.stderr, flush=True)

    context = multiprocessing.get_context("spawn")
    _check_setup(context, args.checkpoint)

    queue = deque(jobs)
    strikes = Counter()
    crashes = 0
    transient = 0
    finished = 0

    def record(result):
        nonlocal transient, finished
        finished += 1
        if "transient" in result:
            transient += 1
            print(f"{result['id']}: left for the next run, {result['transient']}", file=sys.stderr, flush=True)
        else:
            out.write(json.dumps(result, allow_nan=False) + "\n")
            out.flush()
        if finished % 50 == 0:
            print(f"{finished} of {len(jobs)}", file=sys.stderr, flush=True)

    with open(args.out, "a", encoding="utf8") as out:
        while queue:
            in_flight = {}
            try:
                # An executor, not a Pool: a Pool waits forever on a task whose worker was killed, and
                # a hung job raises no alert. No more in flight than workers, so a crash blames few.
                # Workers are recycled, as torch and essentia hold on to memory under a hard limit.
                with ProcessPoolExecutor(args.workers, mp_context=context, initializer=_setup,
                                         initargs=(args.checkpoint,), max_tasks_per_child=100) as pool:
                    while queue or in_flight:
                        while queue and len(in_flight) < args.workers:
                            job = queue.popleft()
                            in_flight[pool.submit(analyse, job)] = job
                        done, _ = wait(in_flight, return_when=FIRST_COMPLETED)
                        for future in done:
                            record(future.result())
                            del in_flight[future]
            except BrokenProcessPool:
                crashes += 1
                print(f"pool crashed ({crashes}), suspects: {[job[0] for job in in_flight.values()]}", file=sys.stderr, flush=True)
                if crashes > MOST_POOL_CRASHES:
                    raise
                for job in in_flight.values():
                    strikes[job[0]] += 1
                    if strikes[job[0]] >= STRIKES_TO_REJECT:
                        record({"id": job[0], "error": f"tracker process crashed {STRIKES_TO_REJECT} times"})
                    else:
                        queue.append(job)
    print(f"done, {transient} left for the next run, {crashes} pool crashes", file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()
