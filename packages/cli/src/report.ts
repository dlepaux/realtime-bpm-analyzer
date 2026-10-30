import type {FileResult} from './api';

/**
 * Formats one result for a terminal.
 * @param result Result of one file
 * @returns Lines without a trailing newline
 */
export function formatText(result: FileResult): string {
  if (!result.ok) {
    return `${result.file}: error: ${result.error}`;
  }

  if (result.bpm === null) {
    return `${result.file}: no clear beat found`;
  }

  const candidates = result.candidates
    .map(({tempo, count, confidence}) => `${tempo} (count ${count}, confidence ${confidence.toFixed(2)})`)
    .join(', ');
  return `${result.file}: ${result.bpm} BPM (confidence ${(result.confidence ?? 0).toFixed(2)})\n  candidates: ${candidates}`;
}

/**
 * Formats every result as one JSON document, the shape scripts can rely on.
 * @param results Results in the order the files were given
 * @returns Pretty-printed JSON
 */
export function formatJson(results: readonly FileResult[]): string {
  return JSON.stringify({results}, null, 2);
}
