/** The send time `at` of the last processor message, and the `performance.now()` it was received at */
export type Heard = {readonly at: number; readonly wall: number};

/**
 * The audio clock now, as the render thread reads it, from the main thread.
 *
 * @remarks
 * `currentTime` is not live everywhere: Firefox updates the main thread's copy through main-thread tasks, so it
 * freezes while a long task runs. Two clocks that do run on are extrapolated with `performance.now()`. One is the
 * output timestamp, a pair of clocks sampled together, plus the output latency, since it is when a sample reaches the
 * output. The other is the last processor message heard: its send time, plus the time since it was received.
 * `currentTime` and the message read early, never late, as a message arrives after it is sent, so the latest of
 * the three wins. The output clock can read late, ahead of the render thread: in Firefox it is ahead by the output
 * latency, 48 ms on CI and 9 ms on a Mac, so contextNow can be too. Its one
 * reader is the stale-epoch watchdog's start (`staleAfterSeconds`), which a late clock only moves later: a deaf
 * processor is judged that much later, and a live one is never judged deaf sooner. The output timestamp alone was
 * not enough: in Firefox on CI it stood still through a 1.2 s block too.
 * Only `currentTime` counts while the context does not run, since a suspended clock stands still.
 * @param context The analyzer's context
 * @param heard The last processor message, or null before any
 * @param now The `performance.now()` to extrapolate to, in milliseconds
 * @returns Seconds on the context clock
 */
export function contextNow(context: BaseAudioContext, heard: Heard | null = null, now = performance.now()): number {
  const {currentTime} = context;
  if (context.state !== 'running') {
    return currentTime;
  }

  const sinceHeard = heard === null ? -Infinity : heard.at + ((now - heard.wall) / 1000);
  return Math.max(currentTime, outputClock(context, now), sinceHeard);
}

/** The output timestamp extrapolated to `now`, or -Infinity when the context gives none worth reading */
function outputClock(context: BaseAudioContext, now: number): number {
  const output = context as Partial<Pick<AudioContext, 'getOutputTimestamp' | 'outputLatency'>>;
  if (typeof output.getOutputTimestamp !== 'function') {
    return -Infinity;
  }

  const {contextTime, performanceTime} = output.getOutputTimestamp.call(context);
  // Zero until the output has rendered: extrapolating from it would run the clock on by the page's whole age
  if (typeof contextTime !== 'number' || typeof performanceTime !== 'number' || performanceTime <= 0) {
    return -Infinity;
  }

  const latency = typeof output.outputLatency === 'number' ? output.outputLatency : 0;
  return contextTime + latency + ((now - performanceTime) / 1000);
}
