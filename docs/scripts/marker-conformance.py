"""Reads every exported marker file back and checks it against the beat grid it should hold.

CI only (the "Marker files" job in .github/workflows/main.yml), on the files that
scripts/marker-fixtures.ts writes with the export's own functions. The expected grid is worked
out here from the manifest's inputs, not taken from the TypeScript, and each file is read by a
reader that isn't ours:

- EDL: OpenTimelineIO's CMX 3600 adapter (otio-cmx3600-adapter).
- FCP7 XML (Premiere Pro): OpenTimelineIO's FCP 7 XML adapter (otio-fcp-adapter).
- FCPXML: validated against Apple's FCPXML 1.10 DTD with lxml, then every marker read as an
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
import sys
# The standard parser, not defusedxml: the only XML read here is what marker-fixtures.ts wrote in
# the same CI job, never outside input, and ElementTree fetches no external entities or DTDs (the
# "XML vulnerabilities" table in Python's xml module docs).
import xml.etree.ElementTree as ElementTree
from fractions import Fraction
from pathlib import Path

import opentimelineio as otio
from lxml import etree

# lxml for the DTD check only, on the same files: no entity expansion and no network, so the
# document can't pull in anything but the DTD given here.
SAFE_PARSER = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False)

MAX_MARKERS = 20_000


# RBA-239's file, worked out by hand: 60 beats in 30.0 s at 120 BPM, the last at 29.5 s. The end,
# 30.0 s, is no beat. A grid that wrote one there passed this job until 2026-11-15, because the
# grid below copied the export's own end bound and the only file then had no beat near its end.
KNOWN_GRIDS = {"RBA-239 kick 120 BPM.wav": (60, 29.5)}


def sequence_frames(entry):
    """The sequence's length: the audio's, rounded up to whole frames, so its end is inside."""
    exact = Fraction(entry["duration"]) * entry["numerator"] / entry["denominator"]
    # A float duration a few ulps past a whole frame is that frame (as in beat-markers.ts).
    if abs(exact - round(exact)) <= 4 * sys.float_info.epsilon * exact:
        return max(1, round(exact))
    return max(1, math.ceil(exact))


def expected_frames(entry):
    """The frame of every beat inside the audio, on the nearest frame, while inside the sequence."""
    period = 60 / entry["bpm"]
    numerator, denominator = entry["numerator"], entry["denominator"]
    total = sequence_frames(entry)
    frames = []
    for index in range(MAX_MARKERS):
        seconds = entry["firstBeat"] + index * period
        frame = math.floor(seconds * numerator / denominator + 0.5)
        # The audio's end is not a beat, and a beat that rounds to the sequence's end has no frame.
        if seconds >= entry["duration"] or frame >= total:
            break
        frames.append(frame)
    known = KNOWN_GRIDS.get(entry["name"])
    if known is not None:
        count, last = known
        if len(frames) != count or frames[-1] != math.floor(last * numerator / denominator + 0.5):
            raise AssertionError(f"{entry['file']}: the expected grid is {len(frames)} beats to frame {frames[-1]}")
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


def check_inside(path, entry, declared, found):
    """Every marker on a frame of the sequence the file declares, the audio rounded up to frames."""
    if declared != sequence_frames(entry):
        raise AssertionError(f"{path.name}: a sequence of {declared} frames, expected {sequence_frames(entry)}")
    outside = [frame for frame in found if not 0 <= frame < declared]
    if outside:
        raise AssertionError(f"{path.name}: markers at frames {outside[:5]}, outside 0..{declared - 1}")


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
    check_inside(path, entry, int(root.find("./sequence/duration").text),
                 [int(marker.find("in").text) for marker in root.iter("marker")])
    display = root.find("./sequence/timecode/displayformat").text
    if display != ("DF" if entry["dropFrame"] else "NDF") or (display == "DF" and entry["timebase"] != 30):
        raise AssertionError(f"{path.name}: displayformat {display}")


def check_fcpxml(path, entry, frames, dtd):
    if not dtd.validate(etree.parse(str(path), SAFE_PARSER)):
        errors = "\n".join(str(error) for error in dtd.error_log.filter_from_errors()[:20])
        raise AssertionError(f"{path.name}: not valid against the FCPXML 1.10 DTD\n{errors}")
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
    starts = [Fraction(marker.get("start").removesuffix("s")) / frame_duration for marker in markers]
    declared = Fraction(sequence.get("duration").removesuffix("s")) / frame_duration
    if declared.denominator != 1:
        raise AssertionError(f"{path.name}: a sequence of {declared} frames")
    check_inside(path, entry, int(declared), starts)
    for index, (marker, frame) in enumerate(zip(markers, frames)):
        start = starts[index]
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
        # The row's own seconds and frame agree, apart from any grid: within half a frame, plus
        # the seconds' rounding to 3 decimals. A beat at the end moved onto the last frame doesn't.
        frames_per_second = entry["numerator"] / entry["denominator"]
        if abs(float(row[1]) * frames_per_second - int(row[2])) > 0.5 + 0.0005 * frames_per_second:
            raise AssertionError(f"{path.name}: row {index + 1} puts {row[1]} s on frame {row[2]}")
        # Give or take that rounding too: a beat 0.4 ms before the end can print past it.
        if float(row[1]) >= entry["duration"] + 0.0005:
            raise AssertionError(f"{path.name}: row {index + 1} at {row[1]} s, the audio ends at {entry['duration']} s")
    for index in sample(frames):
        if rows[index + 1][3] != timecode_of(frames[index], entry):
            raise AssertionError(f"{path.name}: row {index + 1} timecode {rows[index + 1][3]}")


def main(fixtures, dtd_path):
    dtd = etree.DTD(str(dtd_path))
    # The check must be able to fail: an element the DTD doesn't define is refused.
    if dtd.validate(etree.fromstring(b'<fcpxml version="1.10"><beat/></fcpxml>', SAFE_PARSER)):
        raise AssertionError("the FCPXML DTD accepted an element it doesn't define")
    manifest = json.loads((fixtures / "manifest.json").read_text(encoding="utf-8"))
    if len(manifest) != 78:
        raise AssertionError(f"{len(manifest)} files, expected 78: 2 files, 4 formats at 10 timecodes, less FCP7 XML at 59.94 DF")
    # The hand-counted grids are the one check that doesn't share the export's rule: a renamed
    # fixture must fail here, not skip them.
    missing = set(KNOWN_GRIDS) - {entry["name"] for entry in manifest}
    if missing:
        raise AssertionError(f"no files for the hand-counted grids {sorted(missing)}")
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
