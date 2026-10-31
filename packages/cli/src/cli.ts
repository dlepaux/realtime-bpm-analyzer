/// <reference types="node" />

import {readFileSync} from 'node:fs';
import {analyzeFile} from './api';
import type {FileResult} from './api';
import {parseCliArgs, usage} from './args';
import type {CliOptions} from './args';
import {errorMessage} from './errors';
import {collectTargets} from './files';
import {formatJson, formatText} from './report';

// `npx realtime-bpm-analyzer-cli song.mp3`, the package's bin. A separate package from the
// library, so the library keeps zero dependencies: the decoders are this package's own.
// Formats they do not read fall back to ffmpeg when it is installed.

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
    const result: FileResult = target.kind === 'error'
      ? {file: target.path, ok: false, error: target.message}
      : await analyzeFile(target.path, {tempoRange: options.tempoRange, detector: options.detector, ffmpegPath});

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
  const parsed = await parseCliArgs(argv);

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
