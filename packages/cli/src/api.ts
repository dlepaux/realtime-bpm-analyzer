/// <reference types="node" />

import {analyzeChannelData} from 'realtime-bpm-analyzer/node';
import type {Candidate, EngineName, OfflineResult, TempoRange} from 'realtime-bpm-analyzer/node';
import {analyzeOnWorker} from './analyze';
import {decodeFile, describeDecodedLimit} from './decode';
import {errorMessage} from './errors';

// The package's programmatic entry (`import {analyzeFile} from 'realtime-bpm-analyzer-cli'`),
// what the CLI itself runs per file, so other front ends (the MCP server) share one decode
// and analysis path. Its declarations are emitted from this file alone and must stay free
// of relative imports in type positions: only the library's types may appear in signatures.

export type {Candidate, CandidateRelation, EngineName, TempoRange} from 'realtime-bpm-analyzer/node';

export type FileResult =
  | ({readonly file: string; readonly ok: true} & (FoundReading | NoReading))
  | {readonly file: string; readonly ok: false; readonly error: string};

/** A file where a beat was found: every field of the reading is set */
export type FoundReading = {
  /** The reading's tempo, a whole number of BPM */
  readonly bpm: number;
  /** The same tempo unrounded, for timing (a beat grid, markers) */
  readonly bpmExact: number;
  /**
   * From 0 to 1. Uncalibrated for now: each engine's own score, so compare
   * values from one engine only and set no absolute cut-off. Not a probability.
   */
  // RBA-106: calibration gives this its meaning, or removes it. Keep this doc in step with Reading.confidence.
  readonly confidence: number;
  /** At most 5, best first, each with its relation to the top one */
  readonly candidates: readonly Candidate[];
  /** The engine that measured the reading */
  readonly engine: EngineName;
};

/** A file where no beat was found: the reading's fields are all null and there are no candidates */
export type NoReading = {
  readonly bpm: null;
  readonly bpmExact: null;
  readonly confidence: null;
  readonly candidates: readonly [];
  readonly engine: null;
};

export type AnalyzeOptions = {
  /** Tempo range to fold candidates into, or to search with the tempogram; the library's default when omitted */
  readonly tempoRange?: TempoRange;
  /** Tempo engine; the library's default when omitted, and the result's `engine` says which ran */
  readonly engine?: EngineName;
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

// The library's default tempoRange, the same for both engines, to fill a missing bound. /node does
// not export it, so tests/cli.test.mjs pins these values to the library's behaviour.
const defaultTempoRange: TempoRange = {min: 90, max: 180};

/**
 * Builds the result of an analysed file.
 * @param file Path as reported
 * @param reading What analyzeChannelData read, or null
 * @returns The result
 */
function successResult(file: string, reading: OfflineResult): FileResult {
  // The reading's fields, flat, so a script reads `bpm` whether or not a beat was found. Two are left
  // out: a file has no analyzer state (the offline result is a reading or null), and `audio` would
  // only repeat the file's length, with a context time that is always null offline.
  if (reading === null) {
    return {file, ok: true, bpm: null, bpmExact: null, confidence: null, candidates: [], engine: null};
  }

  const {bpm, bpmExact, confidence, candidates, engine} = reading;
  return {file, ok: true, bpm, bpmExact, confidence, candidates, engine};
}

/**
 * Decodes and analyses one file. Never throws: a file that cannot be read or decoded
 * comes back as `ok: false` with a one-line message, so a batch keeps going.
 * @param path File to analyse, reported as given
 * @param options Tempo range, engine, ffmpeg binary, abort signal, time limit and decoded size limit
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
    return successResult(path, await analyzeOnWorker({...decoded, tempoRange: options.tempoRange, engine: options.engine}, signal));
  } catch (error: unknown) {
    // Whatever the decoder or the worker threw on abort, the signal that fired first says why
    if (signal?.aborted === true) {
      const timedOut = timeout !== undefined && signal.reason === timeout.reason;
      return {file: path, ok: false, error: timedOut ? `Took longer than the ${describeDuration(timeoutMs ?? 0)} limit for one file.` : 'Cancelled.'};
    }

    return {file: path, ok: false, error: errorMessage(error)};
  }
}

/**
 * @param ms A duration, a whole number of milliseconds
 * @returns It in the plain words of the timeout refusal
 */
function describeDuration(ms: number): string {
  // Under a second in milliseconds, so a short limit never reads as 0 seconds
  if (ms < 1000) {
    return ms === 1 ? '1 millisecond' : `${ms} milliseconds`;
  }

  // A tenth of a second at most above it
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
