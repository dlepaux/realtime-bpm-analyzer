/**
 * @param look What identifies a held-out look: its code, detectors, reason and sets
 * @returns The first line of its progress file
 */
export function lookHeader(look: string): string {
  return `${JSON.stringify({look})}\n`;
}

function parseLines(text: string): unknown[] {
  return text.split('\n').flatMap(line => {
    // A kill can tear the last line: that run is simply done again
    try {
      return line === '' ? [] : [JSON.parse(line) as unknown];
    } catch {
      return [];
    }
  });
}

function isHeader(line: unknown): line is {look: string} {
  return typeof line === 'object' && line !== null && 'look' in line;
}

/**
 * The look is named in the progress file itself, not found in the log: a log line says a look
 * happened, not that these results belong to it. Anything else in the file would score unlogged.
 * @param progress Text of the progress file, empty when there is none
 * @param look The look starting
 * @returns Whether this is that look resuming, false when it has yet to be logged
 * @throws When the file holds results of another look
 */
export function resumesLook(progress: string, look: string): boolean {
  const lines = parseLines(progress);

  if (lines.length === 0) {
    return false;
  }

  const [first] = lines;

  if (!isHeader(first) || first.look !== look) {
    throw new Error(`The progress file holds results of another look than: ${look}`);
  }

  return true;
}

/**
 * @param progress Text of the progress file, empty when there is none
 * @returns Its results, without the look's own line
 */
export function progressRows<Row>(progress: string): Row[] {
  return parseLines(progress).filter(line => !isHeader(line)) as Row[];
}
