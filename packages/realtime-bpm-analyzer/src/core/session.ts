import {HYSTERESIS, PROTOCOL_VERSION} from '../contract/types';
import type {EngineReason, Hysteresis, TempoRange, WorkletMessage} from '../contract/types';
import {createEngine, toReading} from './engine';
import type {ResolvedEngine} from './engine';
import {createTracker} from './tracker';
import type {TrackerOutput} from './tracker';

/** The part of the `liveInput` clock a session reads */
export type LockClock = {
  readonly offerLock: () => boolean;
  readonly forget: () => void;
};

export type SessionOptions = {
  readonly engine: ResolvedEngine;
  readonly tempoRange: TempoRange;
  readonly debug: boolean;
  /** Internal, for tests: the contract's values otherwise */
  readonly hysteresis?: Hysteresis;
};

/** What the main thread hands the processor: validated there, so nothing in the worklet can throw at the caller */
export type ProcessorOptions = SessionOptions & {
  /** The main thread's protocol: a processor that speaks another refuses to start */
  readonly protocol: number;
  /** Whether the main thread reports a live input's clock: without one, `delivered` messages are ignored */
  readonly liveInput: boolean;
};

/**
 * One analyzer's worklet side, without the worklet: the engine, the tracker and the epoch, turned into the
 * `WorkletMessage`s the main thread reduces. The processor runs one; the benchmark runs the same one, so what it
 * measures is what callers get.
 */
export type Session = {
  /**
   * Analyses one full buffer and returns the messages of this step, in order. Usually one step message, but a
   * `restartAfterSeconds` start-over posts its move to listening (`tempo-changed`) before the step's own, so one
   * step can post two. `restartForLostAudio` posts outside any step. Both follow the table. `contextTime` is when
   * the buffer's last sample reached the worklet, for `AudioSpan.contextTime`: null where no context runs.
   */
  readonly analyze: (channelData: Float32Array, bufferSize: number, sampleRate: number, contextTime?: number | null) => Promise<WorkletMessage[]>;
  /** The caller's `reset()`: adopts its epoch, starts over, and acknowledges with `ready` */
  readonly adopt: (epoch: number) => WorkletMessage[];
  /** The `liveInput` clock found that what was heard was lost: the engine starts over */
  readonly restartForLostAudio: () => WorkletMessage[];
  readonly epoch: () => number;
};

/**
 * @param options The validated settings
 * @param clock The `liveInput` clock, once the main thread has reported one
 * @returns The session, in epoch 0
 */
export function createSession(options: SessionOptions, clock: () => LockClock | null = () => null): Session {
  const engine = createEngine(options.engine, options.tempoRange, options.debug);
  const tracker = createTracker(options.hysteresis ?? HYSTERESIS);
  const {restartAfterSeconds} = options.engine;
  let epoch = 0;
  // Audio analysed since the epoch began, and when the engine last started over within it
  let seconds = 0;
  let engineStart = 0;

  const listening = (progress: number, reason?: EngineReason): WorkletMessage => ({
    type: 'step', protocol: PROTOCOL_VERSION, epoch, status: 'listening', progress, reason,
  });

  function restart(reason: 'tempo-changed' | 'audio-lost'): WorkletMessage[] {
    engine.restart();
    clock()?.forget();
    engineStart = seconds;
    const moved: TrackerOutput = tracker.restart(reason);
    return moved.reason === undefined ? [] : [listening(0, moved.reason)];
  }

  async function analyze(channelData: Float32Array, bufferSize: number, sampleRate: number, contextTime: number | null = null): Promise<WorkletMessage[]> {
    const messages: WorkletMessage[] = [];
    if (restartAfterSeconds !== undefined && seconds - engineStart >= restartAfterSeconds) {
      messages.push(...restart('tempo-changed'));
    }

    const measuredIn = epoch;
    const step = await engine.analyze(channelData, bufferSize, sampleRate);
    if (measuredIn !== epoch) {
      return []; // A reset() landed while this buffer was analysed: what it measured belongs to no epoch
    }

    seconds += bufferSize / sampleRate;
    if (step.debug !== undefined) {
      messages.push({type: 'debug', protocol: PROTOCOL_VERSION, epoch, engine: engine.name, data: step.debug});
    }

    const progress = Math.min(1, Math.max(0, step.progress));
    if (!step.fresh) {
      return tracker.status() === 'listening' ? [...messages, listening(progress)] : messages;
    }

    const lossClock = clock();
    const top = step.candidates[0];
    const moved = tracker.step({
      now: seconds,
      bpm: top?.tempo ?? null,
      pulse: step.pulse,
      lockOffered: step.lockOffered,
      acceptLock: () => lossClock?.offerLock() ?? true,
    });

    if (moved.reason === 'pulse-lost' || moved.reason === 'unlocked') {
      engine.onReadingLost();
    }

    if (moved.status === 'listening') {
      return [...messages, listening(progress, moved.reason)];
    }

    // Settling or locked: the tracker only gets there, or stays there, with a reading
    const reading = toReading(step.candidates, {from: Math.min(seconds, engineStart + step.from), to: seconds, contextTime}, engine.name);
    if (reading === null) {
      return messages;
    }

    return [...messages, {type: 'step', protocol: PROTOCOL_VERSION, epoch, status: moved.status, reading, reason: moved.reason}];
  }

  return {
    analyze,
    adopt(next) {
      epoch = next;
      seconds = 0;
      engineStart = 0;
      engine.restart();
      clock()?.forget();
      tracker.reset();
      return [{type: 'ready', protocol: PROTOCOL_VERSION, epoch}];
    },
    restartForLostAudio: () => restart('audio-lost'),
    epoch: () => epoch,
  };
}
