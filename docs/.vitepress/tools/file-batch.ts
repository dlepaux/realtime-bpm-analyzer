// The BPM finder's file batch (RBA-277): how much of a drop it takes, and what its progress says.
// Pure, so node --test checks the arithmetic the component relies on.

/** Files per batch: a folder of 300 would hold the tab for an hour. The copy says how many were left out. */
export const MAX_FILES_PER_BATCH = 50

/** The files a batch analyses, in order, and how many past the cap it leaves out. */
export function planBatch<T>(files: readonly T[], max: number = MAX_FILES_PER_BATCH): { take: T[]; skipped: number } {
  const take = files.slice(0, Math.max(0, max))
  return { take, skipped: files.length - take.length }
}

/** "Analysing 3 of 12" for the file at `index` (from 0). A lone file shows no count: the tool says it. */
export function batchProgressLabel(index: number, total: number): string | null {
  return total > 1 ? `Analysing ${index + 1} of ${total}` : null
}

/** A lone file's failure shows in the tool itself; only a batch lists its failures by name. */
export const listsFailures = (total: number): boolean => total > 1
