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

/** A track whose file holds no audio ffmpeg can turn into samples, for any detector */
export class UndecodableTrack extends Error {}

/**
 * @param path The file
 * @param status ffmpeg's exit status
 * @param samples Bytes it wrote
 * @param stderr What it said
 * @throws {UndecodableTrack} Saying why. A file with a valid header and no samples can exit 0
 */
export function assertDecoded(path: string, status: number | null, samples: number, stderr: string): void {
  if (status !== 0 || samples === 0) {
    throw new UndecodableTrack(`ffmpeg could not decode ${path}: exit ${status}, ${samples} bytes${stderr ? `, ${stderr.trim().slice(0, 200)}` : ''}`);
  }
}

export type RunFailure = {readonly set: string; readonly id: string; readonly reason: string; readonly undecodable: boolean};

/**
 * Distinct tracks a run may lose to a file that cannot decode. RBA-51's first look stopped on one.
 * Three of the thousands in a run cannot move a set's number by much; more means the data or the
 * decoder changed, and that needs a person.
 */
export const undecodableLimit = 3;

/**
 * @param failures Every run that gave no result
 * @returns The tracks a report must name, one line per track however many detectors failed on it
 */
export function skippedTracks(failures: readonly RunFailure[]): RunFailure[] {
  return [...new Map(failures.filter(failure => failure.undecodable).map(failure => [`${failure.set}/${failure.id}`, failure])).values()];
}

/**
 * The guard against a shrunk run. Only a file that cannot decode may be skipped, up to the limit:
 * anything else that kills a run is a fault in the code, which would bias the scores it leaves.
 * @param failures Every run that gave no result
 * @returns Why the run must not close, or null when it may
 */
export function refusalOf(failures: readonly RunFailure[]): string | null {
  const others = failures.filter(failure => !failure.undecodable);
  const skipped = skippedTracks(failures).length;

  if (others.length > 0) {
    return `${others.length} runs failed for a reason other than decoding, first ${others[0].set}/${others[0].id}: ${others[0].reason}`;
  }

  return skipped > undecodableLimit ? `${skipped} tracks cannot decode, over the limit of ${undecodableLimit}` : null;
}

/** RBA-51's held-out budget, per volume: the look of 2026-10-31 and the one its DECISION adds */
export const looksAllowed = 2;

/**
 * Whether the job may start a held-out look. Looks are counted in the log, which outlives any image,
 * so a new commit cannot buy a third.
 * @param log The volume's held-out log, empty when there is none
 * @param isResuming Whether this commit's look already has a progress file
 * @param reason The reason given
 * @returns Why not, or null when it may
 */
export function lookRefusal(log: string, isResuming: boolean, reason: string): string | null {
  const logged = log.split('\n').filter(line => line.startsWith('| ')).length;

  if (isResuming) {
    return null;
  }

  if (logged >= looksAllowed) {
    return `${logged} looks are logged on this volume, the limit is ${looksAllowed}`;
  }

  // A look taken because of an earlier one is not clean, and its log line has to say so
  return logged > 0 && !/second look/i.test(reason) ? 'A look after the first must declare itself a second look in its reason' : null;
}
