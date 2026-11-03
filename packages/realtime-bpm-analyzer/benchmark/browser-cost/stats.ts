/** Frames of a Web Audio render quantum, fixed by the specification */
export const quantumFrames = 128;

export type Summary = {
  count: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
};

/**
 * Real-time budget of one render quantum
 * @param sampleRate - The context's rate
 * @returns Milliseconds the audio thread has to produce a quantum
 */
export function quantumBudgetMs(sampleRate: number): number {
  return (quantumFrames / sampleRate) * 1000;
}

/**
 * Nearest-rank percentile of an ascending array
 * @param sorted - Values, ascending, not empty
 * @param ratio - 0 to 1
 * @returns The value at that rank
 */
export function percentile(sorted: ArrayLike<number>, ratio: number): number {
  if (sorted.length === 0) {
    throw new RangeError('percentile of nothing');
  }

  const rank = Math.ceil(ratio * sorted.length) - 1;

  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}

/**
 * Distribution of the first `count` values, the slots a recorder filled
 * @param values - Recorded values
 * @param count - How many of them are filled
 * @returns Mean and tail, or null when nothing was recorded
 */
export function summarise(values: ArrayLike<number>, count = values.length): Summary | null {
  if (count === 0) {
    return null;
  }

  const sorted = Float64Array.from({length: count}, (_, i) => values[i]).sort();
  let total = 0;

  for (const value of sorted) {
    total += value;
  }

  return {
    count,
    mean: total / count,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted[count - 1],
  };
}

/**
 * Picks the values whose kind matches, for a per-class distribution
 * @param values - Recorded values
 * @param kinds - Kind of each value
 * @param count - Filled slots
 * @param keep - Kinds to keep
 * @returns The matching values
 */
export function ofKinds(values: ArrayLike<number>, kinds: ArrayLike<number>, count: number, keep: readonly number[]): Float64Array {
  const picked: number[] = [];

  for (let i = 0; i < count; i += 1) {
    if (keep.includes(kinds[i])) {
      picked.push(values[i]);
    }
  }

  return Float64Array.from(picked);
}
