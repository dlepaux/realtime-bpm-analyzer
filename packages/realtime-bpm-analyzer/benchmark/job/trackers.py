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
import json
import multiprocessing
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import scipy.stats

SAMPLE_RATE = 22050
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
    import essentia.standard as es
    import torch
    from beat_this.inference import Audio2Beats

    torch.set_num_threads(1)
    _beats = Audio2Beats(checkpoint_path=checkpoint, device="cpu", dbn=False)
    _rhythm = es.RhythmExtractor2013(method="multifeature")
    _key = es.KeyExtractor(profileType="edma", sampleRate=SAMPLE_RATE)


def _duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout.strip())


def _decode(path, start, seconds):
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-nostdin", "-ss", str(start), "-t", str(seconds), "-i", path,
         "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "f32le", "-"],
        capture_output=True, check=True,
    )
    return np.frombuffer(out.stdout, dtype=np.float32).copy()


def _tempo_from_beats(beats):
    """Mean of the intervals near the median. The median alone sits on the 20 ms frame grid, which is
    2 BPM apart at 170, and a plain mean would let one dropped beat move the reading."""
    if len(beats) < 8:
        return None
    intervals = np.diff(beats)
    median = np.median(intervals)
    return float(60.0 / intervals[np.abs(intervals / median - 1) <= 0.1].mean())


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
    """One track. An error is a result: the row says why, and the caller rejects the track."""
    track_id, path = job
    try:
        import librosa

        duration = _duration(path)
        start = max(0.0, (duration - EXCERPT_SECONDS) / 2)
        signal = _decode(path, start, EXCERPT_SECONDS)
        if signal.size < SAMPLE_RATE * 10:
            return {"id": track_id, "error": "under 10 s of audio"}

        beats, _ = _beats(signal, SAMPLE_RATE)
        essentia_bpm = float(_rhythm(signal)[0])
        librosa_bpm = float(np.atleast_1d(librosa.feature.tempo(y=signal, sr=SAMPLE_RATE, prior=FLAT_PRIOR))[0])
        key, scale, strength = _key(signal)

        return {
            "id": track_id,
            "duration": duration,
            "votes": [
                {"method": "beat-this-final0", "bpm": _tempo_from_beats(beats)},
                {"method": "essentia-rhythm2013", "bpm": essentia_bpm},
                {"method": "librosa-tempo-flat-prior", "bpm": librosa_bpm},
            ],
            "halvesAgree": _half_agreement(beats),
            "keyVotes": [f"{key} {scale}", _chroma_key(signal)],
            "keyStrength": float(strength),
        }
    except Exception as error:  # A broken file must not stop thousands of others
        return {"id": track_id, "error": f"{type(error).__name__}: {error}"[:300]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--list", required=True, help="JSON lines of {id, path}")
    parser.add_argument("--out", required=True, help="JSON lines, appended")
    parser.add_argument("--workers", type=int, default=int(os.environ.get("RBA_JOB_WORKERS", "4")))
    parser.add_argument("--checkpoint", default="final0")
    args = parser.parse_args()

    done = set()
    if Path(args.out).exists():
        with open(args.out, encoding="utf8") as handle:
            done = {json.loads(line)["id"] for line in handle if line.strip()}

    with open(args.list, encoding="utf8") as handle:
        rows = [json.loads(line) for line in handle if line.strip()]
    jobs = [(row["id"], row["path"]) for row in rows if row["id"] not in done]
    print(f"{len(jobs)} tracks to read, {len(done)} already read", file=sys.stderr, flush=True)

    # A pool respawns a worker whose setup raises, forever, and a hung job raises no alert. Loading
    # here first makes a missing checkpoint or a broken install end the job at once.
    _setup(args.checkpoint)

    # Recycled workers: torch and essentia hold on to memory, and the job has a hard limit
    with multiprocessing.get_context("spawn").Pool(
        args.workers, initializer=_setup, initargs=(args.checkpoint,), maxtasksperchild=100,
    ) as pool, open(args.out, "a", encoding="utf8") as out:
        for count, result in enumerate(pool.imap_unordered(analyse, jobs), start=1):
            out.write(json.dumps(result) + "\n")
            out.flush()
            if count % 50 == 0:
                print(f"{count} of {len(jobs)}", file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()
