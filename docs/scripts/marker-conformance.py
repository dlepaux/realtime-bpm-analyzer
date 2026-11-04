"""Reads every exported marker file back and checks it against the beat grid it should hold.

CI only (the "Marker files" job in .github/workflows/main.yml), on the files that
scripts/marker-fixtures.ts writes with the export's own functions. The expected grid is worked
out here from the manifest's inputs, not taken from the TypeScript, and each file is read by a
reader that isn't ours:

- EDL: OpenTimelineIO's CMX 3600 adapter (otio-cmx3600-adapter).
- FCP7 XML (Premiere Pro): OpenTimelineIO's FCP 7 XML adapter (otio-fcp-adapter).
- FCPXML: validated against Apple's FCPXML 1.10 DTD with xmllint, then every marker read as an
  exact fraction. OpenTimelineIO's FCPXML adapter (otio-fcpx-xml-adapter) must read the file
  without error, but it can't check the markers: it builds only video, audio, ref-clip and
  asset-clip elements (COMPOSABLE_ELEMENTS in fcpx_xml.py), and the markers sit on a gap.
- CSV: Python's csv module.
Timecode strings are checked against OpenTimelineIO's own to_timecode.

Usage: python3 -I marker-conformance.py <fixtures directory> <FCPXML 1.10 DTD>
"""

import csv
import json
import math
import subprocess
import sys
# The standard parser, not defusedxml: the only XML read here is what marker-fixtures.ts wrote in
# the same CI job, never outside input, and expat resolves no external entities (Python >= 3.7.1).
import xml.etree.ElementTree as ElementTree
from fractions import Fraction
from pathlib import Path

import opentimelineio as otio

MAX_MARKERS = 20_000


def expected_frames(entry):
    """The frame of every beat: beat_times then frame_at in beat-markers.ts, from the spec."""
    period = 60 / entry["bpm"]
    span = entry["duration"] - entry["firstBeat"]
    count = min(MAX_MARKERS, math.floor(span / period) + 1)
    numerator, denominator = entry["numerator"], entry["denominator"]
    # The sequence is the audio's length rounded up to whole frames; a beat in its last half frame
    # moves back onto the last frame instead of rounding past the end.
    last_frame = max(1, math.ceil(entry["duration"] * numerator / denominator)) - 1
    frames = []
    for index in range(count):
        seconds = entry["firstBeat"] + index * period
        frames.append(min(math.floor(seconds * numerator / denominator + 0.5), last_frame))
    return frames


def otio_rate(entry):
    return entry["numerator"] / entry["denominator"]


def sample(frames):
    """First, second, last and every 97th marker: indices whose timecodes cover each minute."""
    return sorted({0, 1, len(frames) - 1, *range(0, len(frames), 97)})


def timecode_of(frame, entry):
    rate = otio_rate(entry)
    return otio.opentime.to_timecode(otio.opentime.RationalTime(frame, rate), rate, entry["dropFrame"])


def check_count(path, found, frames):
    if found != len(frames):
        raise AssertionError(f"{path.name}: {found} markers, expected {len(frames)}")


def check_edl(path, entry, frames):
    raw = path.read_bytes()
    if raw.replace(b"\r\n", b"").find(b"\n") != -1 or raw.replace(b"\r\n", b"").find(b"\r") != -1:
        raise AssertionError(f"{path.name}: a line doesn't end with CR/LF")
    text = raw.decode("ascii")
    has_fcm = "\r\nFCM: " in text
    if has_fcm == (entry["timebase"] in (25, 50)):
        raise AssertionError(f"{path.name}: FCM line {'present' if has_fcm else 'missing'}")

    rate = otio_rate(entry)
    timeline = otio.adapters.read_from_file(str(path), adapter_name="cmx_3600", rate=rate)
    clips = [item for item in timeline.tracks[0] if isinstance(item, otio.schema.Clip)]
    check_count(path, len(clips), frames)
    hour = otio.opentime.from_timecode("01:00:00;00" if entry["dropFrame"] else "01:00:00:00", rate)
    for index, (clip, frame) in enumerate(zip(clips, frames)):
        start = clip.source_range.start_time
        if round(start.value) != round(hour.value) + frame or clip.source_range.duration.value != 1:
            raise AssertionError(f"{path.name}: marker {index + 1} at {start}, expected frame {frame}")
        notes = clip.metadata["cmx_3600"]["comments"]
        if f"|M:Beat {index + 1} |D:1" not in " ".join(notes):
            raise AssertionError(f"{path.name}: marker {index + 1} has notes {notes}")
    for index in sample(frames):
        expected = timecode_of(round(hour.value) + frames[index], entry)
        if f" {expected} " not in text:
            raise AssertionError(f"{path.name}: no record in {expected} for marker {index + 1}")


def check_fcp7(path, entry, frames):
    timeline = otio.adapters.read_from_file(str(path), adapter_name="fcp_xml")
    markers = list(timeline.tracks.markers)
    check_count(path, len(markers), frames)
    rate = otio_rate(entry)
    for index, (marker, frame) in enumerate(zip(markers, frames)):
        start = marker.marked_range.start_time
        if marker.name != f"Beat {index + 1}" or start.value != frame or not math.isclose(start.rate, rate):
            raise AssertionError(f"{path.name}: marker {index + 1} is {marker.name} at {start}, expected frame {frame}")
    root = ElementTree.parse(path).getroot()
    display = root.find("./sequence/timecode/displayformat").text
    if display != ("DF" if entry["dropFrame"] else "NDF") or (display == "DF" and entry["timebase"] != 30):
        raise AssertionError(f"{path.name}: displayformat {display}")


def check_fcpxml(path, entry, frames, dtd):
    result = subprocess.run(["xmllint", "--noout", "--dtdvalid", str(dtd), str(path)], capture_output=True, text=True)
    if result.returncode != 0:
        raise AssertionError(f"{path.name}: not valid against the FCPXML 1.10 DTD\n{result.stderr[:2000]}")
    otio.adapters.read_from_file(str(path), adapter_name="fcpx_xml")

    root = ElementTree.parse(path).getroot()
    frame_duration = Fraction(entry["denominator"], entry["numerator"])
    declared = Fraction(root.find("./resources/format").get("frameDuration").removesuffix("s"))
    if root.get("version") != "1.10" or declared != frame_duration:
        raise AssertionError(f"{path.name}: version {root.get('version')}, frameDuration {declared}")
    sequence = root.find("./library/event/project/sequence")
    if sequence.get("tcFormat") != ("DF" if entry["dropFrame"] else "NDF"):
        raise AssertionError(f"{path.name}: tcFormat {sequence.get('tcFormat')}")
    markers = list(root.iter("marker"))
    check_count(path, len(markers), frames)
    for index, (marker, frame) in enumerate(zip(markers, frames)):
        start = Fraction(marker.get("start").removesuffix("s")) / frame_duration
        if start.denominator != 1 or start != frame or marker.get("value") != f"Beat {index + 1}":
            raise AssertionError(f"{path.name}: marker {index + 1} starts at frame {start}, expected {frame}")


def check_csv(path, entry, frames):
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.reader(handle))
    if rows[0] != ["marker", "seconds", "frame", "timecode"]:
        raise AssertionError(f"{path.name}: header {rows[0]}")
    check_count(path, len(rows) - 1, frames)
    period = 60 / entry["bpm"]
    for index, (row, frame) in enumerate(zip(rows[1:], frames)):
        seconds = entry["firstBeat"] + index * period
        if row[0] != f"Beat {index + 1}" or int(row[2]) != frame or abs(float(row[1]) - seconds) > 0.0005:
            raise AssertionError(f"{path.name}: row {index + 1} is {row}, expected frame {frame} at {seconds:.3f} s")
    for index in sample(frames):
        if rows[index + 1][3] != timecode_of(frames[index], entry):
            raise AssertionError(f"{path.name}: row {index + 1} timecode {rows[index + 1][3]}")


def main(fixtures, dtd):
    manifest = json.loads((fixtures / "manifest.json").read_text(encoding="utf-8"))
    if len(manifest) != 39:
        raise AssertionError(f"{len(manifest)} files, expected 39: 4 formats at 10 timecodes, less FCP7 XML at 59.94 DF")
    for entry in manifest:
        path = fixtures / entry["file"]
        frames = expected_frames(entry)
        if entry["format"] == "edl":
            check_edl(path, entry, frames)
        elif entry["format"] == "fcp7xml":
            check_fcp7(path, entry, frames)
        elif entry["format"] == "fcpxml":
            check_fcpxml(path, entry, frames, dtd)
        elif entry["format"] == "csv":
            check_csv(path, entry, frames)
        else:
            raise AssertionError(f"unknown format {entry['format']}")
        print(f"ok {entry['format']:8} {entry['timecode']:10} {len(frames)} markers, frames {frames[0]} to {frames[-1]}")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
