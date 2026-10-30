/// <reference types="node" />

import {analyzeChannelData} from 'realtime-bpm-analyzer/node';
import type {Tempo, TempoRange} from 'realtime-bpm-analyzer/node';
import {decodeFile} from './decode';
import {errorMessage} from './errors';

// The package's programmatic entry (`import {analyzeFile} from 'realtime-bpm-analyzer-cli'`),
// what the CLI itself runs per file, so other front ends (the MCP server) share one decode
// and analysis path. Its declarations are emitted from this file alone and must stay free
// of relative imports in type positions: only the library's types may appear in signatures.

export type {Tempo, TempoRange} from 'realtime-bpm-analyzer/node';

export type FileResult =
  | {
    readonly file: string;
    readonly ok: true;
    /** Top candidate's tempo, or null when no beat was found */
    readonly bpm: number | null;
    readonly confidence: number | null;
    readonly candidates: readonly Tempo[];
  }
  | {readonly file: string; readonly ok: false; readonly error: string};

export type AnalyzeOptions = {
  /** Tempo range to fold candidates into; the library's default (90 to 180) when omitted */
  readonly tempoRange?: TempoRange;
  /** ffmpeg binary for formats without a bundled decoder (default `ffmpeg` on PATH) */
  readonly ffmpegPath?: string;
  /** Stops an ffmpeg decode in progress (the bundled decoders run to the end) */
  readonly signal?: AbortSignal;
};

/** Extensions of the audio files this package reads by name: the CLI's folder mode picks files by them */
export const audioExtensions: ReadonlySet<string> = new Set([
  '.mp3', '.wav', '.wave', '.flac', '.ogg', '.oga', '.opus', '.m4a', '.aac', '.aif', '.aiff', '.wma',
]);

// The library's default tempoRange, to fill a missing bound. /node does not export it, so
// tests/cli.test.mjs pins these values to the library's behaviour.
const defaultTempoRange: TempoRange = {min: 90, max: 180};

/**
 * Builds the result of an analysed file.
 * @param file Path as reported
 * @param candidates Candidates from analyzeChannelData, best first
 * @returns The result
 */
function successResult(file: string, candidates: readonly Tempo[]): FileResult {
  const [top] = candidates;
  return {file, ok: true, bpm: top?.tempo ?? null, confidence: top?.confidence ?? null, candidates};
}

/**
 * Decodes and analyses one file. Never throws: a file that cannot be read or decoded
 * comes back as `ok: false` with a one-line message, so a batch keeps going.
 * @param path File to analyse, reported as given
 * @param options Tempo range, ffmpeg binary and abort signal
 * @returns The result
 */
export async function analyzeFile(path: string, options: AnalyzeOptions = {}): Promise<FileResult> {
  try {
    const {channelData, sampleRate} = await decodeFile(path, options.ffmpegPath ?? 'ffmpeg', options.signal);
    return successResult(path, await analyzeChannelData(channelData, sampleRate, {tempoRange: options.tempoRange}));
  } catch (error: unknown) {
    return {file: path, ok: false, error: errorMessage(error)};
  }
}

/**
 * Builds a tempoRange from optional bounds, filling a missing one from the library default,
 * and validates it up front so a bad range fails before any file is decoded.
 * @param min Lowest tempo, or undefined for the default
 * @param max Highest tempo, or undefined for the default
 * @returns The range, or undefined when both bounds are omitted (the library default)
 * @throws {Error} The library's message when the range is invalid
 */
export async function resolveTempoRange(min: number | undefined, max: number | undefined): Promise<TempoRange | undefined> {
  if (min === undefined && max === undefined) {
    return undefined;
  }

  const range = {min: min ?? defaultTempoRange.min, max: max ?? defaultTempoRange.max};
  // The library validates tempoRange before it filters anything, so one sample is enough
  // to get its verdict and its message without copying its rules here
  await analyzeChannelData(new Float32Array(1), 44_100, {tempoRange: range});
  return range;
}
