# realtime-bpm-analyzer-mcp

A local [MCP](https://modelcontextprotocol.io) server that lets an assistant (Claude
Desktop, Claude Code, any MCP client) detect the tempo (BPM) of audio files on your
disk, with the [realtime-bpm-analyzer](https://www.npmjs.com/package/realtime-bpm-analyzer)
engine.

**Privacy:** the server runs on your computer and talks to the client over stdio. It
makes no network calls and sends no telemetry: your audio never leaves the machine.

## Install

Claude Desktop: add it to `claude_desktop_config.json` (Settings, Developer, Edit Config),
then restart the app.

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

Claude Code:

```bash
claude mcp add bpm -- npx -y realtime-bpm-analyzer-mcp
```

Any other MCP client: run `npx -y realtime-bpm-analyzer-mcp` as a stdio server. It needs
Node.js 20 or later.

## Tools

| Tool             | Arguments                                                | Returns |
| ---------------- | -------------------------------------------------------- | ------- |
| `analyze_file`   | `path`, optional `min_bpm`, `max_bpm`                    | `bpm`, `confidence` (0 to 1) and the ranked `candidates` |
| `analyze_folder` | `directory`, optional `recursive`, `offset`, `min_bpm`, `max_bpm` | one result per file, in path order; a file that fails carries its `error` and the others go on |

Then ask, for example: "What's the BPM of ~/Music/set/track.mp3?" or "Sort the tracks in
~/Music/house by tempo."

- Formats: MP3, WAV, FLAC, OGG Vorbis and Opus decode in pure JavaScript/WebAssembly.
  M4A/AAC, AIFF and WMA go through [ffmpeg](https://ffmpeg.org) when it is installed (set
  `FFMPEG_PATH` in the server's `env` to point at a binary that is not on the `PATH`).
- Tempos are folded into `min_bpm`..`max_bpm` (default 90 to 180).
- Paths are absolute, start with `~`, or are relative to the server's working directory.
- Limits: files over 100 MB are refused. `analyze_folder` analyses 50 files per call and
  returns a `next_offset` for the next 50; a recursive walk goes 16 levels deep and reads at
  most 10,000 folder entries.
- Only files with an audio extension are read. In a folder, a symbolic link to another
  folder is not followed, and a link to a file outside the folder is refused.

Documentation: [realtime-bpm-analyzer.com/guide/mcp](https://www.realtime-bpm-analyzer.com/guide/mcp).
The command-line tool with the same engine is
[`realtime-bpm-analyzer-cli`](https://www.npmjs.com/package/realtime-bpm-analyzer-cli).
