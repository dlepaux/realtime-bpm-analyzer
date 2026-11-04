/**
 * The audio clock now, as the render thread reads it, from the main thread.
 *
 * @remarks
 * `currentTime` is not live everywhere: Firefox updates the main thread's copy through main-thread tasks, so it
 * freezes while a long task runs. The output timestamp is a pair of clocks sampled together, so extrapolating it with
 * `performance.now()` stays true across the block. It is when a sample reaches the output, which trails the render
 * clock by the output latency, so that is added back. Never earlier than `currentTime`, and `currentTime` alone
 * while the context does not run: a suspended clock stands still, and extrapolating it would run it on.
 * @param context The analyzer's context
 * @returns Seconds on the context clock
 */
export function contextNow(context: BaseAudioContext): number {
  const {currentTime} = context;
  const output = context as Partial<Pick<AudioContext, 'getOutputTimestamp' | 'outputLatency'>>;
  if (context.state !== 'running' || typeof output.getOutputTimestamp !== 'function') {
    return currentTime;
  }

  const {contextTime, performanceTime} = output.getOutputTimestamp.call(context);
  if (typeof contextTime !== 'number' || typeof performanceTime !== 'number') {
    return currentTime;
  }

  const latency = typeof output.outputLatency === 'number' ? output.outputLatency : 0;
  return Math.max(currentTime, contextTime + latency + ((performance.now() - performanceTime) / 1000));
}
