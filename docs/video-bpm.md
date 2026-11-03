---
title: "Video BPM Finder: Find a Video's Tempo"
description: Find the BPM of the music in a video. Drop an MP4, WebM or MOV file and your browser detects the tempo, with the beat in frames. The file stays on your device.
aside: false
editLink: false
tool:
  name: Video BPM Finder
  featureList:
    - Reads the sound track of MP4, WebM and MOV files, and audio files
    - The analysis runs in the browser, so the file stays on the device
    - Shows one beat in milliseconds and in frames at 24 fps
    - Also reads the audio of another browser tab on desktop Chrome and Edge, or the microphone
faq:
  - q: How do I find the BPM of a video?
    a: Drop the video file on the tool at the top of this page, or click it to browse. Your browser decodes the sound track and the analyzer reads the tempo from it. The result shows the BPM and the length of one beat in milliseconds and in frames at 24 fps.
  - q: Is my video uploaded?
    a: No. The file is read and analysed in your browser by the open-source library, which sends nothing anywhere, so the video stays on your device. The website uses Google Analytics to record how the tool is used, such as the tempo found and the file's size, type and duration. It never records the video, its sound or its name. The Website Privacy page has the details.
  - q: Which video formats work?
    a: Any file whose sound your browser can decode. MP4 with AAC sound and WebM usually work. MOV and MKV depend on the browser and on the codec inside. If a file fails, export the sound as WAV or MP3 from your editor and drop that instead.
  - q: Why is the BPM half or double what I expected?
    a: A beat can be heard at two levels, and the analyzer may pick the other one. Both numbers describe the same music. For cutting it rarely matters, since cutting every beat at 70 BPM lands on every other beat at 140 BPM.
  - q: How do I find the BPM of a YouTube video?
    a: The page can't read a YouTube link directly. Paste the link in the Stream tab. On desktop Chrome or Edge the tool then offers to share the audio of another tab, where you play the video. In other browsers it offers the microphone, with the video playing out loud next to it.
  - q: How many frames are in one beat?
    a: Multiply the frame rate by 60 and divide by the BPM. At 120 BPM and 24 fps one beat is 24 × 60 ÷ 120 = 12 frames. The BPM to frames calculator shows every common frame rate.
---

<script setup>
import BpmHeroTool from './.vitepress/components/BpmHeroTool.vue'
import ToolFaq from './.vitepress/components/ToolFaq.vue'
</script>

# Find the BPM of a Video

Drop a video file to find the tempo of its music. Your browser decodes the
sound track and detects the beats per minute (BPM), then shows one beat in
milliseconds and in frames, ready for cutting to the beat.

<div class="video-bpm-tool">
  <BpmHeroTool variant="video" />
</div>

The file is analysed in your browser and stays on your device. The website
records how the tool is used, never the file itself: see
[Website Privacy](/website-privacy). For a video
online, paste its link in the **Stream** tab: on desktop Chrome and Edge the
tool offers to share the audio of the tab that plays it, and elsewhere the
microphone.

## From BPM to frames

One beat lasts 60 ÷ BPM seconds, so:

**Frames per beat = frame rate × 60 ÷ BPM**

At 120 BPM a beat is half a second: 12 frames at 24 fps, 12.5 at 25 fps and
15 at 30 fps. When the count isn't whole, cutting on a rounded number of frames
drifts away from the music over time. The
[BPM to frames calculator](/bpm-to-frames) shows the exact count at every
common frame rate, and how far a rounded cut drifts each bar.

Beat markers you can import into a video editor are planned.

## Limits

- **One tempo per file.** A video with several songs, or a song that changes
  tempo, gets one reading. Trim the part you need, or export its sound.
- **The whole file is read into memory.** A long video in high resolution can
  be several gigabytes, more than a browser tab can hold. Export the sound, or
  a shorter clip, for long footage.
- **The format must be one your browser decodes.** MP4 with AAC sound and WebM
  usually work. MOV and MKV depend on the browser and the codec. If a file
  fails, export the sound as WAV or MP3.
- **A reading can be half or double** the tempo you hear. Both describe the
  same music.
- **The beat must be audible.** Dialogue over quiet music, or music low in the
  mix, can hide it. Pick a section with drums or bass.

Don't trust a reading? [Tap along](/tap-tempo) to check it.

## Frequently asked questions

<ToolFaq />

## More free tools

<div class="tt-tools">
  <a class="tt-tool" href="/bpm-to-frames"><strong>BPM to Frames</strong><span>Frames per beat and per bar at every frame rate</span></a>
  <a class="tt-tool" href="/"><strong>BPM Analyzer</strong><span>Detect the tempo of a file, the mic or a stream</span></a>
  <a class="tt-tool" href="/tap-tempo"><strong>Tap Tempo</strong><span>Tap along to measure any tempo</span></a>
</div>
