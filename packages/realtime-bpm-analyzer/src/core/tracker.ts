import type {ActiveStatus, EngineReason, Hysteresis, ListeningReason} from '../contract/types';

/**
 * What one analysis step tells the tracker. Engine-neutral: each engine fills it in its own way.
 */
export type TrackerInput = {
  /** Seconds of audio analysed since the epoch began, at the end of this step */
  readonly now: number;
  /** The top tempo of this step, or null when the engine has no reading */
  readonly bpm: number | null;
  /** Whether the engine heard a pulse in this step */
  readonly pulse: boolean;
  /** Whether the engine's own lock rule holds in this step */
  readonly lockOffered: boolean;
  /**
   * Asked only when about to lock. False withholds it: the `liveInput` clock refuses a lock heard while input is
   * lost, and arms its start-over, whose move to listening (reason `audio-lost`) is the transition callers see.
   */
  readonly acceptLock: () => boolean;
};

export type TrackerOutput = {
  readonly status: ActiveStatus;
  /** Set only when this step moved the status, as `WorkletMessage` wants it */
  readonly reason?: EngineReason;
};

export type Tracker = {
  readonly step: (input: TrackerInput) => TrackerOutput;
  /**
   * The engine discarded its history (`tempo-changed`, or the `liveInput` clock's `audio-lost`). From settling or
   * locked it is a move to listening; while listening it is silent, as nothing was reported.
   */
  readonly restart: (reason: 'tempo-changed' | 'audio-lost') => TrackerOutput;
  /** The caller's reset: back to listening, silently, since the main thread already moved */
  readonly reset: () => void;
  readonly status: () => ActiveStatus;
};

/**
 * The engine-neutral state machine of the worklet: it turns each step into the status the transition table
 * allows, with hysteresis. Locking follows the engine's own rule; unlocking and a lost pulse follow the
 * engine-neutral bands and dwell times of `hysteresis`, so a reading that wobbles does not flap the state.
 * @param hysteresis The bands and dwell times
 * @returns The tracker, listening with reason `started`
 */
export function createTracker(hysteresis: Hysteresis): Tracker {
  let status: ActiveStatus = 'listening';
  // The tempo the lock was taken at, moved each time the engine confirms a lock
  let anchor = 0;
  let outsideSince: number | null = null;
  let lastPulseAt = 0;
  // A lock the engine offered while listening, or on the step that left it: peaks offers once per rung, and
  // after a lost pulse it may offer on its kept history before the pulse is back, so the offer would be lost
  let pendingOffer = false;

  const enterListening = (reason: Exclude<ListeningReason, 'started' | 'reset'>): TrackerOutput => {
    status = 'listening';
    outsideSince = null;
    pendingOffer = false;
    return {status, reason};
  };

  const hold = (): TrackerOutput => ({status});

  function stepLocked(bpm: number, input: TrackerInput): TrackerOutput {
    if (input.lockOffered) {
      anchor = bpm;
    }

    if (Math.abs(bpm - anchor) <= hysteresis.unlockBand * anchor) {
      outsideSince = null;
      return hold();
    }

    outsideSince ??= input.now;
    if (input.now - outsideSince < hysteresis.unlockAfterSeconds) {
      return hold();
    }

    status = 'settling';
    outsideSince = null;
    return {status, reason: 'unlocked'};
  }

  function step(input: TrackerInput): TrackerOutput {
    if (input.pulse) {
      lastPulseAt = input.now;
    }

    if (status === 'listening') {
      pendingOffer ||= input.lockOffered;
      if (input.bpm === null || !input.pulse) {
        return hold();
      }

      status = 'settling';
      return {status, reason: 'first-reading'};
    }

    if (input.now - lastPulseAt >= hysteresis.pulseLostAfterSeconds) {
      return enterListening('pulse-lost');
    }

    if (input.bpm === null) {
      return hold();
    }

    if (status === 'locked') {
      return stepLocked(input.bpm, input);
    }

    const offered = input.lockOffered || pendingOffer;
    pendingOffer = false;
    if (!offered) {
      return hold();
    }

    // Refused while input is lost: readings go on, and the clock's start-over reports the loss once it ends.
    // Moving to listening here would flap, as the tempogram offers a lock on every step.
    if (!input.acceptLock()) {
      return hold();
    }

    status = 'locked';
    anchor = input.bpm;
    outsideSince = null;
    return {status, reason: 'locked'};
  }

  return {
    step,
    restart(reason) {
      lastPulseAt = 0;
      pendingOffer = false;
      return status === 'listening' ? hold() : enterListening(reason);
    },
    reset() {
      status = 'listening';
      anchor = 0;
      outsideSince = null;
      lastPulseAt = 0;
      pendingOffer = false;
    },
    status: () => status,
  };
}
