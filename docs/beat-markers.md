---
title: "Auto Beat Markers for Video Editing"
description: "Drop a song and get a marker on every beat, as a file for Premiere Pro, DaVinci Resolve or Final Cut Pro, or a CSV. Free, and it runs in your browser."
aside: false
editLink: false
tool:
  name: Beat Markers
  featureList:
    - A marker on every beat of a song, from the first strong beat
    - XML for Premiere Pro, EDL for DaVinci Resolve, FCPXML for Final Cut Pro, and CSV
    - Frame rates from 23.976 to 60 fps, with drop-frame or non-drop timecode at 29.97 and 59.94
    - The analysis runs in the browser, so the song stays on the device
faq:
  - q: How do I get beat markers automatically?
    a: "Drop the song on the tool at the top of this page. Once the tempo is found, the export opens: pick your editor's format and the frame rate of your timeline, then download. The file holds a marker on every beat, from the first strong beat."
  - q: How do I add beat markers in Premiere Pro for free?
    a: "Download the XML for Premiere Pro, then in Premiere Pro choose File > Import and pick the file. It adds a sequence with a marker on every beat. The tool is free, with no account."
  - q: How do I get the beats of a song into DaVinci Resolve?
    a: "Download the EDL for DaVinci Resolve. In Resolve, right-click your timeline in the Media Pool, then Timelines > Import > Timeline Markers from EDL. The markers assume the timeline starts at 01:00:00:00."
  - q: How do I import FCPXML beat markers into Final Cut Pro?
    a: "Download the FCPXML for Final Cut Pro, then choose File > Import > XML. It adds a project with a marker on every beat. The file is FCPXML 1.10, which needs Final Cut Pro 10.6.1 or later."
  - q: How do I edit to the beat with the markers?
    a: "Line your cuts up with the markers. Each one sits on a whole frame of your timeline's rate, at a beat of the song. Check that the first marker and the last one sit on the beat before you cut."
  - q: Which frame rates can I pick?
    a: "23.976, 24, 25, 29.97, 30, 50, 59.94 and 60 fps, with drop-frame or non-drop timecode at 29.97 and 59.94. The XML for Premiere Pro has no 59.94 drop-frame, so pick 59.94 non-drop there."
  - q: Why do the markers drift away from the music?
    a: "The markers are a fixed grid at one tempo, so they suit songs with a steady tempo. A song that speeds up, slows down or changes tempo drifts away from them. Trim the part with a steady beat, or check the markers along the way."
  - q: Is my song uploaded?
    a: "No. The song is read and analysed in your browser by the open-source library, which sends no audio anywhere, and the marker file is made on your device. The website uses Google Analytics to record how the tool is used, such as the tempo found, the file's size, type and duration, and the format and frame rate you export. It never records the song, its sound or its name. The Website Privacy page has the details."
---

<script setup>
import BpmHeroTool from './.vitepress/components/BpmHeroTool.vue'
import BeatMarkerIllustration from './.vitepress/components/BeatMarkerIllustration.vue'
import ToolFaq from './.vitepress/components/ToolFaq.vue'
</script>

# Beat Markers for Premiere Pro, DaVinci Resolve and Final Cut Pro

Drop a song and get a marker on every beat, as a file your video editor
imports. Your browser finds the tempo and the first strong beat, then writes
the markers at the frame rate of your timeline, ready for cutting to the beat.

<div class="page-tool">
  <BpmHeroTool variant="markers" />
</div>

The song is analysed in your browser and stays on your device, and the marker
file is made there too. The website records how the tool is used, never the
file itself: see [Website Privacy](/website-privacy). A video file works as
well: the tool reads its sound track.

<BeatMarkerIllustration />

## What the markers follow

The markers start from the first strong beat and repeat at the song's tempo.
The tool measures that tempo from the file to a fraction of a BPM, so the
markers follow the song, not the whole number the result shows. When the beat
isn't clear enough to refine it, the markers step at the analyzer's own
estimate and the tool says so: on a long song they can then slide off the beat.
In the editor files every marker sits on a whole frame.

## Formats and frame rates

Pick the format of your editor and the frame rate of your timeline:

- **XML for Premiere Pro**: an XML sequence (Final Cut Pro 7 XML) with one
  sequence marker per beat.
- **EDL for DaVinci Resolve**: a CMX 3600 EDL with one event per beat, starting
  at 01:00:00:00.
- **FCPXML for Final Cut Pro**: an FCPXML 1.10 file with a project holding one
  marker per beat.
- **CSV for a spreadsheet**: one row per beat with four columns: `marker`
  (Beat 1, Beat 2...), `seconds` from the start of the file, `frame` from the
  first frame, and `timecode` from 00:00:00:00.

The frame rates are 23.976 fps, 24 fps, 25 fps, 29.97 fps DF, 29.97 fps NDF,
30 fps, 50 fps, 59.94 fps DF, 59.94 fps NDF and 60 fps. DF is drop-frame
timecode and NDF non-drop: pick the one your timeline uses. The XML for
Premiere Pro has no 59.94 fps DF, because that XML format only defines
drop-frame at 29.97 fps, so the tool offers 59.94 fps NDF there.

## Import the markers into your editor

The export shows the same step under the format you pick.

- **Premiere Pro.** In Premiere Pro: File > Import, then pick the file. It adds a sequence with a marker on every beat.
- **DaVinci Resolve.** In DaVinci Resolve: right-click your timeline in the Media Pool, then Timelines > Import > Timeline Markers from EDL. The markers assume the timeline starts at 01:00:00:00.
- **Final Cut Pro.** In Final Cut Pro: File > Import > XML. It adds a project with a marker on every beat. The FCPXML is version 1.10, which needs Final Cut Pro 10.6.1 or later.
- **CSV.** One row per beat, with the time in seconds, the frame and the timecode.

## Limits

- **For songs with a steady tempo.** The markers are a fixed grid, so a song
  that speeds up, slows down or changes tempo drifts away from them.
- **Check the first marker and the last one.** Each file is built from its
  format's published specification, and an automated test checks every marker's
  frame in every format at every frame rate. The files haven't been tested by
  importing them into each editor yet, so check that the first marker and the
  last one sit on the beat before you cut.
- **One tempo per file.** A file with several songs gets one grid. Trim the
  part you need first.
- **The whole file is read into memory.** A very long recording, or a long
  video in high resolution, can be more than a browser tab can hold.
- **A reading can be half or double** the tempo you hear. The markers then
  fall on every other beat, or twice per beat.

Need the beat in frames without a file? The
[BPM to frames calculator](/bpm-to-frames) shows it at every common frame rate.
To find the tempo of a video's music, use the [video BPM finder](/video-bpm).

## Frequently asked questions

<ToolFaq />

## More free tools

<div class="tt-tools">
  <a class="tt-tool" href="/video-bpm"><strong>Video BPM Finder</strong><span>Find the tempo of the music in a video file</span></a>
  <a class="tt-tool" href="/bpm-to-frames"><strong>BPM to Frames</strong><span>Frames per beat and per bar at every frame rate</span></a>
  <a class="tt-tool" href="/tap-tempo"><strong>Tap Tempo</strong><span>Tap along to measure any tempo</span></a>
</div>
