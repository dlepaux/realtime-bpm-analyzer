/// <reference types="node" />

import {McpServer} from '@modelcontextprotocol/server';
import type {CallToolResult} from '@modelcontextprotocol/server';
import {analyzeFile, decodedLimit, resolveTempoRange} from 'realtime-bpm-analyzer-cli';
import type {Candidate, EngineName, FileResult, TempoRange} from 'realtime-bpm-analyzer-cli';
import * as z from 'zod/v4';
import {absolutePath, checkFile, firstLine, limits, listFolder} from './paths';
import {createQueue} from './queue';

// The two tools are this package's public interface: their names, argument names and
// result shapes are what assistants learn and users' prompts rely on. Change them the way
// a library changes an exported function.

const tempoArguments = {
  min_bpm: z.number().positive().max(1000).optional()
    .describe('Lowest tempo to report, in BPM (default 90). The peaks engine folds tempos by octaves into min_bpm..max_bpm, the tempogram searches that range.'),
  max_bpm: z.number().positive().max(2000).optional()
    .describe('Highest tempo to report, in BPM (default 180). Must be at least twice min_bpm.'),
  engine: z.enum(['peaks', 'tempogram']).optional()
    .describe('Tempo engine (default tempogram). The tempogram searches min_bpm..max_bpm instead of folding into it, so from about twice min_bpm a tempo can read half, as over about 179 BPM does by default. peaks folds tempos into the range.'),
};

const path = z.string().min(1).max(4096);

const candidate = z.object({
  bpm: z.number().describe('Tempo in BPM'),
  relation: z.enum(['top', 'half', 'double', 'other'])
    .describe('How it relates to the best tempo: top is the best tempo itself, half and double are within 2% of half or twice it'),
});

// The library's reading, field for field, with the MCP names in snake_case. A file has no analyzer
// state, and the reading's audio span would only repeat the file's length, so neither is here.
const analysis = {
  file: z.string().describe('Absolute path of the file'),
  bpm: z.number().nullable().describe('Best tempo, a whole number of BPM, or null when no clear beat was found'),
  bpm_exact: z.number().nullable().describe('The same tempo unrounded, for timing such as a beat grid or markers. Show bpm to people. Null when no clear beat was found'),
  // Keep this text in step with Reading.confidence (RBA-106)
  confidence: z.number().nullable().describe('From 0 to 1, the estimated chance the best tempo is right (within 4% of the true tempo, half or double counting as wrong), calibrated on licence-clean dev data, so it means the same for either engine. Null when no clear beat was found'),
  candidates: z.array(candidate).describe('Tempo candidates, best first'),
  engine: z.enum(['peaks', 'tempogram']).nullable().describe('The engine that measured the tempo, or null when no clear beat was found'),
};

const formats = 'MP3, WAV, FLAC, OGG Vorbis and Opus (bundled decoders), plus M4A/AAC, AIFF and WMA through ffmpeg when it is installed';
const sizeLimit = `${limits.maxFileBytes / (1024 * 1024)} MB`;
const timeLimit = `A file that takes longer than ${limits.maxFileSeconds} seconds is given up on.`;
const privacy = 'Runs on this computer: the audio is never uploaded.';

/**
 * @param text Plain message for the model
 * @returns A tool error result: the model reads it, the call does not crash
 */
function toolError(text: string): CallToolResult {
  return {content: [{type: 'text', text}], isError: true};
}

/**
 * @param output Structured result, also sent as JSON text for clients that only read text
 * @returns The tool result
 */
function toolResult(output: Record<string, unknown>): CallToolResult {
  return {content: [{type: 'text', text: JSON.stringify(output)}], structuredContent: output};
}

/**
 * @param min min_bpm argument
 * @param max max_bpm argument
 * @returns The validated range (undefined for the default), or the library's reason it is invalid
 */
async function tempoRange(min: number | undefined, max: number | undefined): Promise<TempoRange | undefined | {error: string}> {
  try {
    return await resolveTempoRange(min, max);
  } catch (error: unknown) {
    return {error: firstLine(error)};
  }
}

const ffmpegPath = () => process.env.FFMPEG_PATH || 'ffmpeg';

/**
 * @param tempoRange Validated range, or undefined for the default
 * @param engine Engine argument
 * @param signal The request's signal, aborted when the client cancels
 * @returns analyzeFile's options, with the per-file time limit
 */
const analyzeOptions = (tempoRange: TempoRange | undefined, engine: EngineName | undefined, signal: AbortSignal) => ({
  tempoRange, engine, signal, ffmpegPath: ffmpegPath(), timeoutMs: limits.maxFileSeconds * 1000,
});

/**
 * Builds the server with its two tools.
 * @param version Package version, reported to clients
 * @returns The server, not yet connected
 */
export function createServer(version: string): McpServer {
  const server = new McpServer({name: 'realtime-bpm-analyzer', version});
  const queue = createQueue(limits.maxFilesAtOnce);
  // The per-file time limit starts once the file leaves the queue, so waiting does not use it up
  const analyzeQueued = (file: string, options: ReturnType<typeof analyzeOptions>) => queue(() => analyzeFile(file, options), options.signal);

  server.registerTool('analyze_file', {
    title: 'Analyse the BPM of an audio file',
    description: `Detects the tempo (BPM) of one audio file on this computer. Reads ${formats}. `
      + `Returns the best tempo, the estimated chance it is right, the ranked candidates and the engine that ran. Files over ${sizeLimit} or ${decodedLimit} are refused. ${timeLimit} ${privacy}`,
    inputSchema: z.strictObject({
      path: path.describe('Path of the audio file. Absolute, or starting with ~ for the home folder.'),
      ...tempoArguments,
    }),
    outputSchema: z.object(analysis),
    annotations: {readOnlyHint: true, idempotentHint: true, openWorldHint: false},
  }, async ({path: raw, min_bpm: min, max_bpm: max, engine}, ctx) => {
    const range = await tempoRange(min, max);
    if (range !== undefined && 'error' in range) {
      return toolError(range.error);
    }

    const checked = await checkFile(absolutePath(raw));
    if (!checked.ok) {
      return toolError(checked.error);
    }

    const result = await analyzeQueued(checked.path, analyzeOptions(range, engine, ctx.mcpReq.signal));
    if (result === undefined) {
      return toolError('Cancelled.');
    }

    if (!result.ok) {
      return toolError(`Could not analyse ${result.file}: ${firstLine(result.error)}`);
    }

    return toolResult(analysisOutput(result));
  });

  server.registerTool('analyze_folder', {
    title: 'Analyse the BPM of every audio file in a folder',
    description: `Detects the tempo (BPM) of the audio files in a folder on this computer, in path order. Reads ${formats}. `
      + `Analyses at most ${limits.maxFolderFiles} files per call: when next_offset is not null, call again with offset set to it for the next files. `
      + `With recursive, walks sub-folders up to ${limits.maxDepth} levels deep and reads at most ${limits.maxFolderEntries} folder entries. `
      + 'Symbolic links to folders are not followed, and a link to a file outside the folder is refused. '
      + `A file that cannot be read or decoded, or is over ${sizeLimit} or ${decodedLimit}, or takes longer than ${limits.maxFileSeconds} seconds, is reported with its error and does not stop the others. `
      + `A folder without audio files returns no results, not an error. ${privacy}`,
    inputSchema: z.strictObject({
      directory: path.describe('Path of the folder. Absolute, or starting with ~ for the home folder.'),
      recursive: z.boolean().optional().describe('Also analyse sub-folders (default false)'),
      offset: z.number().int().min(0).max(limits.maxFolderEntries).optional()
        .describe('Index of the first file to analyse, from a previous call\'s next_offset (default 0)'),
      ...tempoArguments,
    }),
    outputSchema: z.object({
      directory: z.string().describe('Absolute path of the folder'),
      results: z.array(z.discriminatedUnion('ok', [
        z.object({...analysis, ok: z.literal(true)}),
        z.object({
          file: z.string().describe('Absolute path of the file, or of a sub-folder that could not be read'),
          ok: z.literal(false),
          error: z.string().describe('Why it was not analysed'),
        }),
      ])).describe('One result per file, in path order'),
      total: z.number().describe('Audio files found in the folder, analysed or not by this call'),
      next_offset: z.number().nullable().describe('offset for the next call, or null when this call reached the last file'),
      scan_truncated: z.boolean().describe(`Whether the walk stopped after ${limits.maxFolderEntries} folder entries, so total leaves files out`),
    }),
    annotations: {readOnlyHint: true, idempotentHint: true, openWorldHint: false},
  }, async ({directory: raw, recursive = false, offset = 0, min_bpm: min, max_bpm: max, engine}, ctx) => {
    const range = await tempoRange(min, max);
    if (range !== undefined && 'error' in range) {
      return toolError(range.error);
    }

    const directory = absolutePath(raw);
    const folder = await listFolder(directory, recursive);
    if ('error' in folder) {
      return toolError(folder.error);
    }

    if (offset > 0 && offset >= folder.entries.length) {
      return toolError(`offset ${offset} is past the last file: the folder has ${folder.entries.length}.`);
    }

    const page = folder.entries.slice(offset, offset + limits.maxFolderFiles);
    const {signal} = ctx.mcpReq;
    const progressToken = ctx.mcpReq._meta?.progressToken;
    const results: FolderResult[] = [];
    for (const entry of page) {
      // The client cancelled: nobody reads the result, so stop decoding
      if (signal.aborted) {
        return toolError('Cancelled.');
      }

      if (entry.kind === 'error') {
        results.push({file: entry.path, ok: false, error: entry.error});
      } else {
        const result = await analyzeQueued(entry.path, analyzeOptions(range, engine, signal));
        if (result === undefined) {
          return toolError('Cancelled.');
        }

        results.push(clean(result));
      }

      // Long batches outlast a client's default request timeout unless it hears progress
      if (progressToken !== undefined) {
        await ctx.mcpReq.notify({
          method: 'notifications/progress',
          params: {progressToken, progress: results.length, total: page.length, message: entry.path},
        });
      }
    }

    const next = offset + page.length;
    return toolResult({
      directory,
      results,
      total: folder.entries.length,
      next_offset: next < folder.entries.length ? next : null,
      scan_truncated: folder.scanTruncated,
    });
  });

  return server;
}

type AnalysisOutput = {
  readonly file: string;
  readonly bpm: number | null;
  readonly bpm_exact: number | null;
  readonly confidence: number | null;
  readonly candidates: readonly Candidate[];
  readonly engine: EngineName | null;
};

type FolderResult = (AnalysisOutput & {readonly ok: true}) | {readonly file: string; readonly ok: false; readonly error: string};

/**
 * @param result An analysed file
 * @returns The tool's output for it, in the tool's names
 */
function analysisOutput(result: Extract<FileResult, {ok: true}>): AnalysisOutput {
  return {
    file: result.file,
    bpm: result.bpm,
    bpm_exact: result.bpmExact,
    confidence: result.confidence,
    candidates: result.candidates,
    engine: result.engine,
  };
}

/**
 * @param result A file's result
 * @returns Its folder entry: the analysis in the tool's names, or the error trimmed to one line
 */
function clean(result: FileResult): FolderResult {
  return result.ok ? {...analysisOutput(result), ok: true} : {file: result.file, ok: false, error: firstLine(result.error)};
}
