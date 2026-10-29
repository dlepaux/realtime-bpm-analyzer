/// <reference types="node" />

import {readFileSync} from 'node:fs';
import {analyzeChannelData} from './node';
import {parseCliArgs, usage} from './cli/args';
import type {CliOptions} from './cli/args';
import {decodeFile} from './cli/decode';
import {collectTargets, errorMessage} from './cli/files';
import type {FileResult} from './cli/report';
import {formatJson, formatText, successResult} from './cli/report';

// `npx realtime-bpm-analyzer song.mp3`, the package's bin. Built to dist/cli.mjs on its own,
// with the decoders left external, so neither the browser bundle nor the /node entry ever
// load them. The decoders are optional dependencies: formats they do not cover, or a
// missing decoder, fall back to ffmpeg when it is installed.

const exitCodes = {ok: 0, fileFailed: 1, usage: 2} as const;

/**
 * Analyses every target in order, one at a time so memory holds a single decoded file.
 * @param options Parsed options
 * @param onResult Called as each file finishes, for text output that streams
 * @returns Every result, in order
 */
async function analyzeAll(options: CliOptions, onResult: (result: FileResult) => void): Promise<FileResult[]> {
  const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
  const results: FileResult[] = [];

  for (const target of await collectTargets(options.paths, options.recursive)) {
    let result: FileResult;
    if (target.kind === 'error') {
      result = {file: target.path, ok: false, error: target.message};
    } else {
      try {
        const {channelData, sampleRate} = await decodeFile(target.path, ffmpegPath);
        result = successResult(target.path, await analyzeChannelData(channelData, sampleRate, {tempoRange: options.tempoRange}));
      } catch (error: unknown) {
        result = {file: target.path, ok: false, error: errorMessage(error)};
      }
    }

    results.push(result);
    onResult(result);
  }

  return results;
}

/**
 * @returns The installed package version, read at run time because the release bumps
 * package.json after the build
 */
function packageVersion(): string {
  const manifest: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const version = (manifest as {version?: unknown}).version;
  return typeof version === 'string' ? version : 'unknown';
}

/**
 * Runs the CLI.
 * @param argv Arguments after the script name
 * @returns The process exit code
 */
async function main(argv: readonly string[]): Promise<number> {
  const parsed = parseCliArgs(argv);

  switch (parsed.kind) {
    case 'help': {
      process.stdout.write(usage);
      return exitCodes.ok;
    }

    case 'version': {
      process.stdout.write(`${packageVersion()}\n`);
      return exitCodes.ok;
    }

    case 'usage-error': {
      process.stderr.write(`realtime-bpm-analyzer: ${parsed.message}\nRun realtime-bpm-analyzer --help for usage.\n`);
      return exitCodes.usage;
    }

    case 'run': {
      const {options} = parsed;
      const results = await analyzeAll(options, result => {
        if (!options.json) {
          (result.ok ? process.stdout : process.stderr).write(`${formatText(result)}\n`);
        }
      });

      if (options.json) {
        process.stdout.write(`${formatJson(results)}\n`);
      }

      return results.every(result => result.ok) ? exitCodes.ok : exitCodes.fileFailed;
    }
  }
}

// `realtime-bpm-analyzer ./music | head` closes the pipe early: stop quietly instead of
// crashing on EPIPE with a stack trace. Exit 1, because the report was cut short.
process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code !== 'EPIPE') {
    throw error;
  }

  process.exit(exitCodes.fileFailed);
});

main(process.argv.slice(2)).then(code => {
  process.exitCode = code;
}, (error: unknown) => {
  process.stderr.write(`realtime-bpm-analyzer: ${errorMessage(error)}\n`);
  process.exitCode = exitCodes.fileFailed;
});
