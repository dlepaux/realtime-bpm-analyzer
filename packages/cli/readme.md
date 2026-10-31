# realtime-bpm-analyzer-cli

Detect the tempo (BPM) of audio files from the command line, with the
[realtime-bpm-analyzer](https://www.npmjs.com/package/realtime-bpm-analyzer) engine.

```bash
npx realtime-bpm-analyzer-cli song.mp3
```

```text
song.mp3: 128 BPM (confidence 0.46)
  candidates: 128 (count 157, confidence 0.46), 171 (count 77, confidence 0.23), ...
```

Installed (`npm install -g realtime-bpm-analyzer-cli`), the command is also
available as `realtime-bpm-analyzer` and `rba`.

## Usage

```bash
rba song.mp3 other.flac           # several files
rba --json ./music                # every audio file of a folder, as one JSON document
rba -r --min-bpm 70 --max-bpm 140 ./music
```

| Option            | Meaning                                                        |
| ----------------- | -------------------------------------------------------------- |
| `--json`          | Print one JSON document instead of text                        |
| `-r, --recursive` | Walk sub-folders (up to 32 levels)                             |
| `--min-bpm <bpm>` | Lowest tempo reported (default 90, 50 with `tempogram`)        |
| `--max-bpm <bpm>` | Highest tempo reported (default 180, 240 with `tempogram`, at least 2 × `--min-bpm`) |
| `--detector <name>` | `peaks` (default) or `tempogram`                             |
| `-h, --help`      | Show the help                                                  |
| `-v, --version`   | Show the version                                               |

A folder is read one level deep unless `-r` is given, and only files with an audio
extension are picked up. Files are analysed one at a time, in a stable order. A file
that fails is reported and the batch goes on.

Exit codes: `0` when every file was analysed, `1` when at least one failed, `2` for a
usage error.

## Formats

MP3, WAV, FLAC, OGG Vorbis and Opus decode in pure JavaScript and WebAssembly, so
no system tool is needed. M4A/AAC and other formats go through
[ffmpeg](https://ffmpeg.org) when it is on the `PATH` (or set `FFMPEG_PATH`).

Audio that decodes to more than 2048 MB in its first channel (202 minutes at 44.1 kHz) is
refused, not truncated. A file that fits peaks at about 4.2 GB of memory.

The JSON output, the decoders and their licences are described in the
[CLI guide](https://www.realtime-bpm-analyzer.com/guide/cli).

## Programmatic use

The package also exports the function the command runs on each file, for Node.js tools
that want the same decoding (the [MCP server](https://www.npmjs.com/package/realtime-bpm-analyzer-mcp) uses it):

```js
import {analyzeFile, resolveTempoRange} from 'realtime-bpm-analyzer-cli';

const result = await analyzeFile('song.mp3', {tempoRange: await resolveTempoRange(70, undefined)});
// {file, ok: true, bpm, confidence, candidates} or {file, ok: false, error}: it never throws
```

`resolveTempoRange(min, max)` fills a missing bound with the default and throws on an
invalid range. `audioExtensions` is the set of extensions folder mode picks up.

## Licence

Apache-2.0. The FLAC, Vorbis and Opus decoders depend on `codec-parser`
(LGPL-3.0), installed unmodified as a separate package.
