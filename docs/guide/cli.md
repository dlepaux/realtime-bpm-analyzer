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

Like `analyzeFullBuffer`, the command analyses the first channel of the whole file,
so memory grows with the length of the audio.

### Length limit

A file whose first channel decodes to more than 2048 MB is refused with an error, and
a batch moves on to the next file. At 32 bits per sample that is 202 minutes at
44.1 kHz, or 186 minutes at 48 kHz in the bundled decoders (ffmpeg always delivers
44.1 kHz). The file is refused, not truncated, because a tempo
from part of a file would differ from the browser's `analyzeFullBuffer` without saying so.

The limit is on decoded audio, not file size, because compression hides length: 24 hours
of silent FLAC fits in 2.3 MB. The headers are checked first, so an honest file is refused
in milliseconds. The samples are then counted as they are decoded, so a file with false
or missing headers is stopped too. ffmpeg is killed the same way. A file also fails
if a bundled decoder gets 32 MB of it without producing any audio, and a WAV fails
if it declares more than 64 channels.

Peak memory measured on macOS arm64 with Node 24:

| File | Outcome | Peak memory |
| --- | --- | --- |
| Opus, 3 h 6 min at 48 kHz (just under the limit) | Analysed | 4.2 GB |
| AAC through ffmpeg, 3 h at 44.1 kHz | Analysed | 3.6 GB |
| Opus, 4 h, refused from its headers | Refused | 14 MB |
| AAC through ffmpeg, 4 h, refused while decoding | Refused | 2.0 GB |
| 24 h silent FLAC with no length in its header, refused while decoding | Refused | 2.6 GB |

The peak is about twice the decoded size because analysis filters a copy of the samples.
Programs using `analyzeFile` can change the limit with its `maxDecodedBytes` option.
