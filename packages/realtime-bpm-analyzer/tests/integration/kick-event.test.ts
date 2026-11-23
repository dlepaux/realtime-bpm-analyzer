import {expect} from 'chai';
import {createRealtimeBpmAnalyzer} from '../../src/index';
import type {BpmAnalyzer, Kick} from '../../src/index';
import {contextNow} from '../../src/core/context-now';
import {absolutePercentile, createKickScene, scoreKicks} from '../fixtures/kick-scenes';
import {closeAudioContext, createTestAudioContext} from '../setup';

/**
 * The kick event from every live input, in a real browser with a real-time AudioContext: a media element
 * (a file or a radio), a MediaStream (a tab's audio), and a MediaStream with `liveInput` (the mic, played here by
 * synthetic audio, as no CI runner has a mic). Each test logs the delay from the kick reaching the analyzer to the
 * listener, as `KICK-DELAY`, for the report.
 *
 * Thresholds, and why:
 * - Every kick heard but at most one, and no false kick: the audio is the synthetic scene the unit test scores, so
 *   a miss here is a loss in the wiring, not in the detector. One may fall in the first moments of playback.
 * - Where the clock is known, the kick's `contextTime` is within 8 ms of where the scene put it on the context
 *   clock: the detector's own error, and half a 60 Hz frame.
 * - Delay to the listener: median 40 ms, max 150 ms. A runner's main thread stalls now and then, and a test that
 *   failed on that would measure the runner. The report gives the measured numbers, which are what counts.
 *
 * The scene is the full mix's first seconds: kicks under a bass line, hats and a pad, as music plays, so the delay is
 * the one a track gets and not that of kicks alone, which are confirmed sooner.
 *
 * The delay is read on `currentTime`, or on a bare worklet's clock run on by the wall clock where that is later (as
 * Firefox's `currentTime` stands still between updates), not on `contextNow`'s output timestamp: Firefox shifts both
 * halves of `getOutputTimestamp()` back by `outputLatency` (measured on 132 and 158), so the output timestamp plus
 * `outputLatency` runs that far ahead there, 48 ms on CI, and the delay read 62-67 ms where it was 14-19. The
 * probe's clock reads early by one message's crossing instead, about 2 ms in Chromium. Both readings are logged,
 * with the bare message's own crossing, so the log shows which clock moved.
 */
describe('BpmAnalyzer - kick events from live inputs', function () {
  this.timeout(20_000);

  /** Seconds of the scene each input plays */
  const seconds = 6;

  let audioContext: AudioContext;
  let cleanups: Array<() => void> = [];

  /** The last message of the clock probe: the render clock when it was posted, and when it was received */
  let probe: {at: number; wall: number} | null;
  /** The bare probe message's crossing, on the two clocks that do not depend on it */
  let crossings: Array<{byCurrentTime: number; byOutputClock: number}>;

  beforeEach(async () => {
    audioContext = createTestAudioContext();
    cleanups = [];
    probe = null;
    crossings = [];
    const url = URL.createObjectURL(new Blob([clockProbeModule], {type: 'text/javascript'}));
    await audioContext.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const node = new AudioWorkletNode(audioContext, 'kick-test-clock-probe');
    const mute = audioContext.createGain();
    mute.gain.value = 0;
    node.connect(mute).connect(audioContext.destination);
    node.port.onmessage = (event: MessageEvent<number>) => {
      probe = {at: event.data, wall: performance.now()};
      crossings.push({byCurrentTime: audioContext.currentTime - event.data, byOutputClock: contextNow(audioContext) - event.data});
    };
  });

  /** The render clock now: the probe's last post run on by the time since, never behind currentTime */
  function renderNow(): number {
    const sincePost = probe === null ? -Infinity : probe.at + ((performance.now() - probe.wall) / 1000);
    return Math.max(audioContext.currentTime, sincePost);
  }

  afterEach(async () => {
    cleanups.forEach(cleanup => {
      cleanup();
    });
    await closeAudioContext(audioContext);
  });

  /** The scene's first seconds, rendered at the context's rate */
  function scene() {
    const full = createKickScene('full-mix', audioContext.sampleRate);
    const samples = full.samples.slice(0, seconds * audioContext.sampleRate);
    return {samples, kicks: full.kicks.filter(time => time < seconds - 0.1)};
  }

  function bufferOf(samples: Float32Array<ArrayBuffer>): AudioBuffer {
    const buffer = audioContext.createBuffer(1, samples.length, audioContext.sampleRate);
    buffer.copyToChannel(samples, 0);
    return buffer;
  }

  /** Every kick, with the context time its listener ran at */
  function listen(analyzer: BpmAnalyzer) {
    const heard: Array<{kick: Kick; at: number; byOutputClock: number}> = [];
    analyzer.on('kick', kick => {
      heard.push({kick, at: renderNow(), byOutputClock: contextNow(audioContext)});
    });
    return heard;
  }

  async function waitSeconds(duration: number): Promise<void> {
    await new Promise(resolve => {
      setTimeout(resolve, duration * 1000);
    });
  }

  /** Checks and logs what one input heard, against the scene's kicks shifted by `offset` on the context clock */
  function assertHeard(input: string, heard: ReadonlyArray<{kick: Kick; at: number; byOutputClock: number}>, truth: readonly number[], offset: number, timingBound: number) {
    const score = scoreKicks(truth.map(time => time + offset), heard.map(({kick}) => kick.contextTime), 0.05);
    const delays = heard.map(({kick, at}) => at - kick.contextTime);
    const ms = (value: number) => Number((value * 1000).toFixed(1));
    const spread = (values: readonly number[]) => ({median: ms(absolutePercentile(values, 0.5)), p90: ms(absolutePercentile(values, 0.9)), max: ms(absolutePercentile(values, 1))});
    const {contextTime: playing = 0, performanceTime = 0} = audioContext.getOutputTimestamp();
    console.log(`KICK-DELAY ${JSON.stringify({
      input,
      browser: navigator.userAgent,
      sampleRate: audioContext.sampleRate,
      baseLatency: audioContext.baseLatency,
      outputLatency: audioContext.outputLatency,
      kicks: score.kicks,
      hits: score.hits,
      falseKicks: score.falseKicks,
      delayMs: spread(delays),
      delayByOutputClockMs: spread(heard.map(({kick, byOutputClock}) => byOutputClock - kick.contextTime)),
      bareMessageMs: {byCurrentTime: spread(crossings.map(({byCurrentTime}) => byCurrentTime)), byOutputClock: spread(crossings.map(({byOutputClock}) => byOutputClock))},
      outputTimestampBehindMs: {contextTime: ms(audioContext.currentTime - playing), performanceTime: Number((performance.now() - performanceTime).toFixed(1))},
      timingMs: {median: ms(absolutePercentile(score.errors, 0.5)), max: ms(absolutePercentile(score.errors, 1))},
    })}`);

    expect(score.misses, `${input}: missed kicks`).to.be.at.most(1);
    expect(score.falseKicks, `${input}: false kicks`).to.equal(0);
    expect(absolutePercentile(score.errors, 1), `${input}: timing`).to.be.at.most(timingBound);
    expect(Math.min(...delays), `${input}: no listener runs before its kick`).to.be.at.least(0);
    expect(absolutePercentile(delays, 0.5), `${input}: median delay`).to.be.at.most(0.04);
    expect(absolutePercentile(delays, 1), `${input}: max delay`).to.be.at.most(0.15);
    heard.forEach(({kick}) => {
      expect(Object.keys(kick).sort()).to.deep.equal(['contextTime', 'strength']);
      expect(kick.strength).to.be.within(0, 1);
    });
  }

  /**
   * Where the first kick landed on the context clock, when the input does not say: the first one heard, matched
   * to the scene's first kick. The other kicks are then scored against the scene's spacing.
   */
  const offsetOf = (heard: ReadonlyArray<{kick: Kick}>, truth: readonly number[]) => (heard.length === 0 ? 0 : heard[0].kick.contextTime - truth[0]);

  it('stamps each kick where it is on the context clock, from a buffer played through the context', async () => {
    const {samples, kicks} = scene();
    const analyzer = await createRealtimeBpmAnalyzer(audioContext);
    const heard = listen(analyzer);
    const source = audioContext.createBufferSource();
    source.buffer = bufferOf(samples);
    source.connect(analyzer.input);
    const startAt = audioContext.currentTime + 0.2;
    source.start(startAt);
    cleanups.push(() => source.disconnect());

    await waitSeconds(seconds + 0.5);
    analyzer.stop();

    // The context clock is known here: the source starts at `startAt`, sample-accurate
    assertHeard('buffer source', heard, kicks, startAt, 0.008);
  });

  it('fires from a media element, as a file or a radio plays', async () => {
    const {samples, kicks} = scene();
    const analyzer = await createRealtimeBpmAnalyzer(audioContext);
    const heard = listen(analyzer);
    const url = URL.createObjectURL(new Blob([wav(samples, audioContext.sampleRate)], {type: 'audio/wav'}));
    const element = new Audio(url);
    const source = audioContext.createMediaElementSource(element);
    source.connect(analyzer.input);
    cleanups.push(() => {
      element.pause();
      URL.revokeObjectURL(url);
    });

    // Bounded, so that an element that never starts fails here and says so, not as the test's timeout
    await Promise.race([
      element.play(),
      waitSeconds(5).then(() => {
        throw new Error(`the media element did not start within 5 s (readyState ${element.readyState}, networkState ${element.networkState}, error ${element.error?.code ?? 'none'}, page ${document.visibilityState})`);
      }),
    ]);
    await waitSeconds(seconds + 0.5);
    analyzer.stop();

    // When the element's first sample reached the context is not known, so the kicks are scored on their spacing
    assertHeard('media element', heard, kicks, offsetOf(heard, kicks), 0.012);
  });

  for (const liveInput of [false, true]) {
    const input = liveInput ? 'microphone stand-in (MediaStream, liveInput)' : 'MediaStream, as a tab\'s audio';
    it(`fires from a ${input}`, async () => {
      const {samples, kicks} = scene();
      const destination = audioContext.createMediaStreamDestination();
      const [track] = destination.stream.getAudioTracks();
      const analyzer = await createRealtimeBpmAnalyzer(audioContext, liveInput ? {liveInput: track} : undefined);
      const heard = listen(analyzer);
      const player = audioContext.createBufferSource();
      player.buffer = bufferOf(samples);
      player.connect(destination);
      const stream = audioContext.createMediaStreamSource(destination.stream);
      stream.connect(analyzer.input);
      player.start();
      cleanups.push(() => {
        player.disconnect();
        stream.disconnect();
      });

      await waitSeconds(seconds + 0.5);
      analyzer.stop();

      assertHeard(input, heard, kicks, offsetOf(heard, kicks), 0.012);
    });
  }
});

/**
 * A bare worklet that posts its clock and does nothing else, as the tests' context clock where the main thread's
 * `currentTime` stands still, as in Firefox. Every 8th quantum, 21 ms at 48 kHz: the reading runs on from the last
 * post by the wall clock, so posting more often would not make it more exact, and a post per quantum would add 375
 * messages a second to the main thread the test measures.
 */
const clockProbeModule = `registerProcessor('kick-test-clock-probe', class extends AudioWorkletProcessor {
  n = 0;
  process() {
    if ((this.n++ & 7) === 0) {
      this.port.postMessage(currentTime);
    }
    return true;
  }
});`;

/**
 * Encodes mono samples as a 16-bit PCM WAV file
 * @param samples From -1 to 1
 * @param sampleRate Their rate
 * @returns The file's bytes
 */
function wav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bytes = new ArrayBuffer(44 + (samples.length * 2));
  const view = new DataView(bytes);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  text(0, 'RIFF');
  view.setUint32(4, 36 + (samples.length * 2), true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => {
    view.setInt16(44 + (index * 2), Math.round(Math.max(-1, Math.min(1, sample)) * 32_767), true);
  });

  return bytes;
}
