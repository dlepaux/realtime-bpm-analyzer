// The worklet globals the library's processor needs, on the page's main thread, so the same class can
// replay audio there under CPU throttling. A function, not a side-effect import: the package declares
// "sideEffects": false, so esbuild drops a bare `import './page-shim'`.

class ShimProcessor {
  port: MessagePort;

  constructor() {
    const channel = new MessageChannel();

    // Drained, so posted events do not pile up and read as heap growth
    channel.port2.onmessage = () => undefined;
    this.port = channel.port1;
  }
}

/**
 * Defines the worklet globals. Call it before the processor's module loads: the module reads them then.
 */
export function installWorkletShim(): void {
  Object.assign(globalThis, {
    AudioWorkletProcessor: ShimProcessor,
    registerProcessor: () => undefined,
    sampleRate: 44_100,
    // The processor stamps its messages and readings with the context clock. Nothing here schedules on it,
    // so a clock that stays at 0 serves, and keeps the timed work the same as in a worklet
    currentTime: 0,
  });
}
