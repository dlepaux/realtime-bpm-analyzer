---
title: BPM Detection for AI Assistants (MCP Server)
description: Let Claude Desktop, Claude Code or any MCP client detect the BPM of audio files on your disk with the local realtime-bpm-analyzer-mcp server. The audio never leaves your machine.
---

# BPM Detection for AI Assistants (MCP Server)

`realtime-bpm-analyzer-mcp` is a local [Model Context Protocol](https://modelcontextprotocol.io)
server. An assistant that speaks MCP (Claude Desktop, Claude Code and others) can ask
it for the tempo of audio files on your computer. It uses the same decoders and
analysis as the [command-line tool](./cli).

The server runs on your machine and talks to the assistant's app over stdio. It makes
no network calls and sends no telemetry, so the audio never leaves your computer. The
assistant only sees the results: paths, tempos and confidences.

## Install

It needs Node.js 20 or later. In **Claude Desktop**, open Settings, Developer, Edit
Config, add the server to `claude_desktop_config.json` and restart the app:

```json
{
  "mcpServers": {
    "bpm": {
      "command": "npx",
      "args": ["-y", "realtime-bpm-analyzer-mcp"]
    }
  }
}
```

In **Claude Code**:

```bash
claude mcp add bpm -- npx -y realtime-bpm-analyzer-mcp
```

Any other MCP client runs `npx -y realtime-bpm-analyzer-mcp` as a stdio server.

Then ask in plain words: "What's the BPM of ~/Music/set/track.mp3?", or "List the
tracks in ~/Music/house slower than 124 BPM."

## Tools

### `analyze_file`

| Argument  | Meaning                                                           |
| --------- | ----------------------------------------------------------------- |
| `path`    | The audio file. Absolute, or starting with `~` for the home folder |
| `min_bpm` | Lowest tempo reported (default 90)                                |
| `max_bpm` | Highest tempo reported (default 180, at least 2 × `min_bpm`)      |
| `detector` | `peaks` (default) or `tempogram`, which searches `min_bpm`..`max_bpm` instead of folding into it: from about twice `min_bpm` a tempo can read half, as over about 179 BPM does by default |

```json
{
  "file": "/Users/me/Music/song.mp3",
  "bpm": 128,
  "confidence": 0.459,
  "candidates": [{"tempo": 128, "count": 157, "confidence": 0.459}]
}
```

`bpm` and `confidence` come from the top candidate and are `null` when no beat was
found. A file that cannot be analysed returns a tool error with a one-line reason.

### `analyze_folder`

| Argument    | Meaning                                                          |
| ----------- | ---------------------------------------------------------------- |
| `directory` | The folder                                                       |
| `recursive` | Also analyse sub-folders (default `false`)                       |
| `offset`    | First file to analyse, from the previous call's `next_offset`    |
| `min_bpm`, `max_bpm`, `detector` | As for `analyze_file`                       |

```json
{
  "directory": "/Users/me/Music",
  "results": [
    {"file": "/Users/me/Music/a.mp3", "ok": true, "bpm": 128, "confidence": 0.459, "candidates": []},
    {"file": "/Users/me/Music/b.mp3", "ok": false, "error": "No audio samples decoded (mp3)."}
  ],
  "total": 2,
  "next_offset": null,
  "scan_truncated": false
}
```

Files are analysed one at a time, in path order. A file that fails carries its
`error`, and the others go on. A folder without audio files returns an empty
`results`, not an error.

## Limits and safety

The server reads files on an assistant's request, so it checks every path first.
These checks prevent surprises; they are not a sandbox. `analyze_file` reads any
audio file your user account can read, as the command-line tool would.


- Only files with an audio extension are read, and only regular files.
- Files over 100 MB are refused.
- Audio that decodes to more than 2048 MB is refused, whatever the size of the file:
  that is the first channel at 32 bits per sample, so 202 minutes at 44.1 kHz (186 at
  48 kHz in the bundled decoders; ffmpeg always delivers 44.1 kHz). Low-bitrate audio reaches it long before 100 MB. The check runs on
  the file's headers first and on the decoded samples after, so a file cannot hide
  its length. See [the CLI guide](/guide/cli) for the memory this means.
- `analyze_folder` analyses at most 50 files per call, about 3 seconds each, so a call
  ends before the client gives up. `next_offset` pages through the rest.
- A recursive walk goes at most 16 levels deep and reads at most 10,000 folder
  entries; `scan_truncated` says when it stopped early.
- In a folder, a symbolic link to another folder is never followed (no loops), and a
  symbolic link to a file outside the folder is refused, so a walk stays inside the
  folder you named.
- Errors come back as one plain line, never a stack trace.
- A cancelled `analyze_folder` call stops before the next file, and stops ffmpeg.

## Formats

MP3, WAV, FLAC, OGG Vorbis and Opus decode in pure JavaScript and WebAssembly. M4A/AAC,
AIFF and WMA go through [ffmpeg](https://ffmpeg.org) when it is installed; to use a
binary that is not on the `PATH`, set `FFMPEG_PATH` in the server's `env` in the client
configuration. See [the command-line guide](./cli#formats-and-decoders) for the
decoders and their licences.
