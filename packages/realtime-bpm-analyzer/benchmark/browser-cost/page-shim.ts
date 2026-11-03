// The worklet globals the library's processor needs, on the page's main thread, so the same class can
// replay audio there under CPU throttling. Imported first: the processor's module reads them when it loads.

class ShimProcessor {
  port: MessagePort;

  constructor() {
    const channel = new MessageChannel();

    // Drained, so posted events do not pile up and read as heap growth
    channel.port2.onmessage = () => undefined;
    this.port = channel.port1;
  }
}

Object.assign(globalThis, {
  AudioWorkletProcessor: ShimProcessor,
  registerProcessor: () => undefined,
  sampleRate: 44_100,
});
