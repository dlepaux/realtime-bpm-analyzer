/// <reference types="node" />

import {analyzeChannelData} from 'realtime-bpm-analyzer/node';
import type {Detector, Tempo, TempoRange} from 'realtime-bpm-analyzer/node';
import {analyzeOnWorker} from './analyze';
import {decodeFile, describeDecodedLimit} from './decode';
import {errorMessage} from './errors';

// The package's programmatic entry (`import {analyzeFile} from 'realtime-bpm-analyzer-cli'`),
// what the CLI itself runs per file, so other front ends (the MCP server) share one decode
// and analysis path. Its declarations are emitted from this file alone and must stay free
// of relative imports in type positions: only the library's types may appear in signatures.

export type {Detector, Tempo, TempoRange} from 'realtime-bpm-analyzer/node';

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
  /** Tempo range to fold candidates into, or to search with the tempogram; the library's default when omitted */
  readonly tempoRange?: TempoRange;
  /** Tempo detector; the library's default (`peaks`) when omitted */
  readonly detector?: Detector;
  /** ffmpeg binary for formats without a bundled decoder (default `ffmpeg` on PATH) */
  readonly ffmpegPath?: string;
  /** Stops the decode or the analysis in progress; the result is then `Cancelled.` */
  readonly signal?: AbortSignal;
  /** Gives up on a file after this many milliseconds, decode and analysis together (no limit when omitted) */
  readonly timeoutMs?: number;
  /** Refuse a file whose first channel decodes to more than this (default defaultMaxDecodedBytes) */
  readonly maxDecodedBytes?: number;
};

/**
 * Decoded size refused by default. A 100 MB MP3 at 128 kbps fits, and
 * the process peaks at about 2.1 times this much memory: analysis filters a copy of the samples.
 */
export const defaultMaxDecodedBytes = 2 * 1024 * 1024 * 1024;

// Longest delay a Node timer holds: a longer one fires after 1 ms instead
const maxTimeoutMs = 2 ** 31 - 1;

/** The default limit in the plain words of the refusal, for documentation and tool descriptions */
export const decodedLimit: string = describeDecodedLimit(defaultMaxDecodedBytes);

/** Extensions of the audio files this package reads by name: the CLI's folder mode picks files by them */
export const audioExtensions: ReadonlySet<string> = new Set([
  '.mp3', '.wav', '.wave', '.flac', '.ogg', '.oga', '.opus', '.m4a', '.aac', '.aif', '.aiff', '.wma',
]);

// The library's default tempoRange, the same for both detectors, to fill a missing bound. /node does
// not export it, so tests/cli.test.mjs pins these values to the library's behaviour.
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
 * @param options Tempo range, detector, ffmpeg binary, abort signal, time limit and decoded size limit
 * @returns The result
 */
export async function analyzeFile(path: string, options: AnalyzeOptions = {}): Promise<FileResult> {
  const {timeoutMs} = options;
  if (timeoutMs !== undefined && !(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= maxTimeoutMs)) {
    return {file: path, ok: false, error: `Invalid timeoutMs: ${timeoutMs}. Use a whole number of milliseconds from 1 to ${maxTimeoutMs}.`};
  }

  const timeout = timeoutMs === undefined ? undefined : AbortSignal.timeout(timeoutMs);
  const signals = [options.signal, timeout].filter(signal => signal !== undefined);
  const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
  try {
    const decoded = await decodeFile(path, {
      ffmpegPath: options.ffmpegPath ?? 'ffmpeg',
      maxDecodedBytes: options.maxDecodedBytes ?? defaultMaxDecodedBytes,
      signal,
    });
    return successResult(path, await analyzeOnWorker({...decoded, tempoRange: options.tempoRange, detector: options.detector}, signal));
  } catch (error: unknown) {
    // Whatever the decoder or the worker threw on abort, the signal that fired first says why
    if (signal?.aborted === true) {
      const timedOut = timeout !== undefined && signal.reason === timeout.reason;
      return {file: path, ok: false, error: timedOut ? `Took longer than the ${describeSeconds(timeoutMs ?? 0)} limit for one file.` : 'Cancelled.'};
    }

    return {file: path, ok: false, error: errorMessage(error)};
  }
}

/**
 * @param ms A duration
 * @returns It in the plain words of the timeout refusal
 */
function describeSeconds(ms: number): string {
  // A tenth of a second at most, so a short test timeout does not read as 0
  const seconds = Math.round(ms / 100) / 10;
  return seconds === 1 ? '1 second' : `${seconds} seconds`;
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
