#!/usr/bin/env python3
"""The image's own check: the trackers ran, and the first read a generated tempo as the label says.
A broken tool shows up as an error row or a null vote, not as a failed command."""
import json
import sys

readings_path, generated_path = sys.argv[1:3]
with open(readings_path, encoding="utf8") as handle:
    row = json.loads(handle.readline())
with open(generated_path, encoding="utf8") as handle:
    label = json.loads(handle.readline())["bpm"]

assert "error" not in row and "votes" in row, row
bpms = [vote["bpm"] for vote in row["votes"]]
assert all(bpm is not None for bpm in bpms), row
assert abs(bpms[0] / label - 1) <= 0.04, (label, row)
print(f"label {label}, read {bpms}")
