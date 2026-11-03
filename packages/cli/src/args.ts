/// <reference types="node" />

import {parseArgs} from 'node:util';
import type {Detector, TempoRange} from 'realtime-bpm-analyzer/node';
import {resolveTempoRange} from './api';
import {errorMessage} from './errors';

export type CliOptions = {
  readonly paths: readonly string[];
  readonly json: boolean;
  readonly recursive: boolean;
  readonly tempoRange: TempoRange | undefined;
  readonly detector: Detector;
};

export type ParsedArgs =
  | {readonly kind: 'help'}
  | {readonly kind: 'version'}
  | {readonly kind: 'run'; readonly options: CliOptions}
  | {readonly kind: 'usage-error'; readonly message: string};

export const usage = `Usage: realtime-bpm-analyzer [options] <file|folder>...

Detects the tempo of audio files (MP3, WAV, FLAC, OGG Vorbis, Opus; M4A/AAC
and other formats through ffmpeg when it is installed).

Options:
  --json             Print one JSON document instead of text
  -r, --recursive    Walk sub-folders of a folder (up to 32 levels)
  --min-bpm <bpm>    Lowest tempo reported (default 90)
  --max-bpm <bpm>    Highest tempo reported (default 180, at least 2 x min)
  --detector <name>  peaks (default) or tempogram, which searches the range
                     instead of folding into it: from about 2 x min a tempo
                     can read half, as over about 179 does by default
  -h, --help         Show this help
  -v, --version      Show the version

Exit codes: 0 every file analysed, 1 at least one file failed, 2 bad usage.
Set FFMPEG_PATH to use an ffmpeg binary that is not on PATH.
`;

/**
 * Parses the command line into what to do. Never throws and never exits: the caller
 * owns stdout, stderr and the exit code.
 * @param argv Arguments after the script name
 * @returns The action, or a usage error to print
 */
export async function parseCliArgs(argv: readonly string[]): Promise<ParsedArgs> {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        json: {type: 'boolean', default: false},
        recursive: {type: 'boolean', short: 'r', default: false},
        'min-bpm': {type: 'string'},
        'max-bpm': {type: 'string'},
        detector: {type: 'string', default: 'peaks'},
        help: {type: 'boolean', short: 'h', default: false},
        version: {type: 'boolean', short: 'v', default: false},
      },
    });
  } catch (error: unknown) {
    return {kind: 'usage-error', message: error instanceof Error ? error.message : String(error)};
  }

  const {values, positionals} = parsed;
  if (values.help) {
    return {kind: 'help'};
  }

  if (values.version) {
    return {kind: 'version'};
  }

  if (positionals.length === 0) {
    return {kind: 'usage-error', message: 'Missing a file or folder to analyse.'};
  }

  const {detector} = values;
  if (detector !== 'peaks' && detector !== 'tempogram') {
    return {kind: 'usage-error', message: `Invalid detector: ${detector}. Use peaks or tempogram.`};
  }

  const range = await parseTempoRange(values['min-bpm'], values['max-bpm']);
  if (typeof range === 'string') {
    return {kind: 'usage-error', message: range};
  }

  return {
    kind: 'run',
    options: {paths: positionals, json: values.json, recursive: values.recursive, tempoRange: range, detector},
  };
}

/**
 * Builds a tempoRange from the two flags, filling the missing one from the library default,
 * and validates it now so a bad range fails before any file is decoded.
 * @param min Raw --min-bpm value
 * @param max Raw --max-bpm value
 * @returns The range, undefined for the default, or an error message
 */
async function parseTempoRange(min: string | undefined, max: string | undefined): Promise<TempoRange | undefined | string> {
  // Number('') is 0, so an empty value must not slip through as a number
  const toNumber = (raw: string | undefined) =>
    raw === undefined ? undefined : (raw.trim() === '' ? Number.NaN : Number(raw));

  try {
    return await resolveTempoRange(toNumber(min), toNumber(max));
  } catch (error: unknown) {
    return errorMessage(error);
  }
}
