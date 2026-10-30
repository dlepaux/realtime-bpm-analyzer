---
title: BPM Detection from the Command Line
description: Detect the BPM of MP3, WAV, FLAC, OGG and Opus files from a terminal with npx realtime-bpm-analyzer-cli, as text or JSON, one file or a whole folder.
---

# BPM Detection from the Command Line

`realtime-bpm-analyzer-cli` is a separate npm package that decodes audio files and
analyses them with [`analyzeChannelData`](./node), the library's Node.js entry point.
It is separate so the library itself keeps zero dependencies.

```bash
npx realtime-bpm-analyzer-cli song.mp3
```

```text
song.mp3: 128 BPM (confidence 0.46)
  candidates: 128 (count 157, confidence 0.46), 171 (count 77, confidence 0.23), ...
```

Installed globally (`npm install -g realtime-bpm-analyzer-cli`), the command is also
available as `realtime-bpm-analyzer` and as `rba`. It needs Node.js 20 or later.

## Files and folders

Give it several files, or a folder. A folder is read one level deep, or up to 32
levels with `--recursive`, and only files with an audio extension are picked up.
Files are analysed one at a time, in a stable order: arguments as given, folder
contents sorted by path. A file that fails is reported and the batch goes on.

| Option            | Meaning                                                        |
| ----------------- | -------------------------------------------------------------- |
| `--json`          | Print one JSON document instead of text                        |
| `-r, --recursive` | Walk sub-folders                                               |
| `--min-bpm <bpm>` | Lowest tempo reported (default 90)                             |
| `--max-bpm <bpm>` | Highest tempo reported (default 180, at least 2 × `--min-bpm`) |
| `-h, --help`      | Show the help                                                  |
| `-v, --version`   | Show the version                                               |

The exit code is `0` when every file was analysed, `1` when at least one failed
and `2` for a usage error, such as an unknown option or an invalid tempo range.

## JSON output

```json
{
  "results": [
    {
      "file": "music/song.mp3",
      "ok": true,
      "bpm": 128,
      "confidence": 0.459,
      "candidates": [{"tempo": 128, "count": 157, "confidence": 0.459}]
    },
    {"file": "music/broken.mp3", "ok": false, "error": "No audio samples decoded (mp3)."}
  ]
}
```

`bpm` and `confidence` come from the top candidate and are `null` when no beat
was found. `candidates` has the shape `analyzeChannelData` returns.

## Formats and decoders

MP3, WAV, FLAC, OGG Vorbis and Opus decode in pure JavaScript and WebAssembly
with the `@audio/decode-*` packages (MIT), so no system tool is needed. The FLAC,
Vorbis and Opus decoders depend on `codec-parser` (LGPL-3.0), installed unmodified
as a separate package. A run loads only the decoders its files need.

M4A/AAC, and any format the bundled decoders do not read, go through
[ffmpeg](https://ffmpeg.org) when it is on the `PATH`. Set `FFMPEG_PATH` to use
another binary. No permissively licensed JavaScript AAC decoder exists, hence
ffmpeg. The format is read from the file's first bytes, not its extension.

Like `analyzeFullBuffer`, the command analyses the first channel, and it decodes
each file whole, so memory grows with the length of the file.
