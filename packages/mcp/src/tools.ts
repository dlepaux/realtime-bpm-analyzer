/// <reference types="node" />

import {McpServer} from '@modelcontextprotocol/server';
import type {CallToolResult} from '@modelcontextprotocol/server';
import {analyzeFile, resolveTempoRange} from 'realtime-bpm-analyzer-cli';
import type {FileResult, TempoRange} from 'realtime-bpm-analyzer-cli';
import * as z from 'zod/v4';
import {absolutePath, checkFile, firstLine, limits, listFolder} from './paths';

// The two tools are this package's public interface: their names, argument names and
// result shapes are what assistants learn and users' prompts rely on. Change them the way
// a library changes an exported function.

const tempoArguments = {
  min_bpm: z.number().positive().max(1000).optional()
    .describe('Lowest tempo to report, in BPM (default 90). Tempos are folded by octaves into min_bpm..max_bpm.'),
  max_bpm: z.number().positive().max(2000).optional()
    .describe('Highest tempo to report, in BPM (default 180). Must be at least twice min_bpm.'),
};

const path = z.string().min(1).max(4096);

const candidate = z.object({
  tempo: z.number().describe('Tempo in BPM'),
  count: z.number().describe('Peak intervals that voted for this tempo; candidates are ranked by it'),
  confidence: z.number().describe('Share of all votes that agree with this tempo, from 0 to 1'),
});

const analysis = {
  file: z.string().describe('Absolute path of the file'),
  bpm: z.number().nullable().describe('Best tempo, or null when no clear beat was found'),
  confidence: z.number().nullable().describe('Confidence of the best tempo, from 0 to 1'),
  candidates: z.array(candidate).describe('Tempo candidates, best first'),
};

const formats = 'MP3, WAV, FLAC, OGG Vorbis and Opus (bundled decoders), plus M4A/AAC, AIFF and WMA through ffmpeg when it is installed';
const sizeLimit = `${limits.maxFileBytes / (1024 * 1024)} MB`;
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
 * Builds the server with its two tools.
 * @param version Package version, reported to clients
 * @returns The server, not yet connected
 */
export function createServer(version: string): McpServer {
  const server = new McpServer({name: 'realtime-bpm-analyzer', version});

  server.registerTool('analyze_file', {
    title: 'Analyse the BPM of an audio file',
    description: `Detects the tempo (BPM) of one audio file on this computer. Reads ${formats}. `
      + `Returns the best tempo, its confidence and the ranked candidates. Files over ${sizeLimit} are refused. ${privacy}`,
    inputSchema: z.strictObject({
      path: path.describe('Path of the audio file. Absolute, or starting with ~ for the home folder.'),
      ...tempoArguments,
    }),
    outputSchema: z.object(analysis),
    annotations: {readOnlyHint: true, idempotentHint: true, openWorldHint: false},
  }, async ({path: raw, min_bpm: min, max_bpm: max}) => {
    const range = await tempoRange(min, max);
    if (range !== undefined && 'error' in range) {
      return toolError(range.error);
    }

    const checked = await checkFile(absolutePath(raw));
    if (!checked.ok) {
      return toolError(checked.error);
    }

    const result = await analyzeFile(checked.path, {tempoRange: range, ffmpegPath: ffmpegPath()});
    if (!result.ok) {
      return toolError(`Could not analyse ${result.file}: ${firstLine(result.error)}`);
    }

    return toolResult({file: result.file, bpm: result.bpm, confidence: result.confidence, candidates: result.candidates});
  });

  server.registerTool('analyze_folder', {
    title: 'Analyse the BPM of every audio file in a folder',
    description: `Detects the tempo (BPM) of the audio files in a folder on this computer, in path order. Reads ${formats}. `
      + `Analyses at most ${limits.maxFolderFiles} files per call: when next_offset is not null, call again with offset set to it for the next files. `
      + `With recursive, walks sub-folders up to ${limits.maxDepth} levels deep and reads at most ${limits.maxFolderEntries} folder entries. `
      + 'Symbolic links to folders are not followed, and a link to a file outside the folder is refused. '
      + `A file that cannot be read or decoded, or is over ${sizeLimit}, is reported with its error and does not stop the others. ${privacy}`,
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
        z.object({file: z.string(), ok: z.literal(false), error: z.string().describe('Why this file was not analysed')}),
      ])).describe('One result per file, in path order'),
      total: z.number().describe('Audio files found in the folder, analysed or not by this call'),
      next_offset: z.number().nullable().describe('offset for the next call, or null when this call reached the last file'),
      scan_truncated: z.boolean().describe(`Whether the walk stopped after ${limits.maxFolderEntries} folder entries, so total leaves files out`),
    }),
    annotations: {readOnlyHint: true, idempotentHint: true, openWorldHint: false},
  }, async ({directory: raw, recursive = false, offset = 0, min_bpm: min, max_bpm: max}, ctx) => {
    const range = await tempoRange(min, max);
    if (range !== undefined && 'error' in range) {
      return toolError(range.error);
    }

    const directory = absolutePath(raw);
    const folder = await listFolder(directory, recursive);
    if ('error' in folder) {
      return toolError(folder.error);
    }

    if (folder.entries.length === 0) {
      return toolError(`No audio files found in ${directory}${recursive ? '' : ' (its sub-folders were not searched: set recursive)'}.`);
    }

    if (offset >= folder.entries.length) {
      return toolError(`offset ${offset} is past the last file: the folder has ${folder.entries.length}.`);
    }

    const page = folder.entries.slice(offset, offset + limits.maxFolderFiles);
    const progressToken = ctx.mcpReq._meta?.progressToken;
    const results: FileResult[] = [];
    for (const entry of page) {
      results.push(entry.kind === 'error'
        ? {file: entry.path, ok: false, error: entry.error}
        : clean(await analyzeFile(entry.path, {tempoRange: range, ffmpegPath: ffmpegPath()})));

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

/**
 * @param result A file's result
 * @returns The same, with an error message trimmed to one line
 */
function clean(result: FileResult): FileResult {
  return result.ok ? result : {...result, error: firstLine(result.error)};
}
