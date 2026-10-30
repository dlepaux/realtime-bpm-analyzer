# CLI fixtures

Click tracks from `createClickTrack` in the library's
`packages/realtime-bpm-analyzer/tests/fixtures/click-track.ts` (22.05 kHz, 20 s, mono,
16-bit WAV), encoded with ffmpeg 8 to keep each file under 100 kB:

| File             | BPM | Encoding                                      |
| ---------------- | --- | --------------------------------------------- |
| click-128.mp3    | 128 | `-b:a 32k`                                    |
| click-100.flac   | 100 | `-compression_level 12`                       |
| click-140.ogg    | 140 | `-c:a vorbis -strict -2 -ac 2 -b:a 48k`       |
| click-140.opus   | 140 | `-c:a libopus -b:a 16k` (48 kHz)              |
| click-128.m4a    | 128 | `-c:a aac -b:a 32k`, decoded through ffmpeg   |

The tests also read the library's `bass-test.wav` in place, so its pinned tempo has one source.
