// Each analysis runs on its own worker and can hold about 4 GB at its worst (2 GB decoded plus
// the copy analysis filters), and assistants do make tool calls in parallel. Every analysis the
// server runs goes through one queue, so its memory is bounded by the queue, not by the client.

/**
 * Runs a task once a slot is free, or gives up waiting when the signal aborts.
 * @returns The task's result, or undefined when the signal aborted before the task started
 */
export type Queue = <T>(task: () => Promise<T>, signal: AbortSignal) => Promise<T | undefined>;

/**
 * @param slots Most tasks running at once, at least 1
 * @returns A queue that starts its tasks in the order they arrive
 */
export function createQueue(slots: number): Queue {
  if (!(Number.isInteger(slots) && slots >= 1)) {
    throw new RangeError(`Invalid queue slots: ${slots}`);
  }

  let running = 0;
  // A Set keeps insertion order, and a cancelled waiter leaves it in one step
  const waiting = new Set<() => void>();

  const release = () => {
    const [next] = waiting;
    if (next === undefined) {
      running -= 1;
      return;
    }

    // The slot passes straight to the next waiter, so running stays the same
    waiting.delete(next);
    next();
  };

  /**
   * @param signal Aborts the wait
   * @returns Whether the slot a finished task released was handed over, false when the signal aborted first
   */
  const waitForSlot = (signal: AbortSignal): Promise<boolean> => new Promise<boolean>(resolve => {
    const onAbort = () => {
      waiting.delete(start);
      resolve(false);
    };

    const start = () => {
      signal.removeEventListener('abort', onAbort);
      resolve(true);
    };

    waiting.add(start);
    signal.addEventListener('abort', onAbort, {once: true});
  });

  return async (task, signal) => {
    if (signal.aborted) {
      return undefined;
    }

    if (running < slots) {
      running += 1;
    } else if (!await waitForSlot(signal)) {
      return undefined;
    }

    try {
      return await task();
    } finally {
      release();
    }
  };
}
