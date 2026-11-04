import {realtimeBpmProcessorName} from './core/consts';
import realtimeBpmProcessorContent from './generated-processor';
import {constructAnalyzer, whenReady} from './core/bpm-analyzer';
import type {BpmAnalyzer} from './core/bpm-analyzer';
import {getBiquadFilter} from './core/offline-pipeline';
import {assertNoRemovedOptions, resolveEngine} from './core/engine';
import {PROTOCOL} from './contract/types';
import type {AnalyzerOptions} from './contract/types';
import type {ProcessorOptions} from './core/session';

// Public API surface: explicit named re-exports only. The contract (src/contract) is the public shape; internal
// types stay in core/types.ts, unreachable because package.json `exports` publishes only `.`, `./processor` and
// `./node`.

export {BpmAnalyzer} from './core/bpm-analyzer';
export {analyzeFullBuffer, getBiquadFilter} from './core/offline-pipeline';
export {RELATION_TOLERANCE} from './contract/types';
export type {
  AnalyzerOptions,
  OfflineOptions,
  EngineOption,
  OfflineEngineOption,
  EngineName,
  TempoRange,
  Reading,
  OfflineResult,
  Candidate,
  CandidateRelation,
  AudioSpan,
  AnalyzerState,
  Status,
  ListeningReason,
  StateChange,
  StateChangeReason,
  EngineReason,
  CallerReason,
  Progress,
  DebugInfo,
  AnalyzerEventMap,
  AnalyzerEventType,
  AnalyzerError,
  AnalyzerErrorName,
  ListenOptions,
} from './contract/types';
export type {BiquadFilterOptions} from './core/types';

/**
 * Creates a real-time BPM analyzer for live audio.
 *
 * @param audioContext - The AudioContext to run in
 * @param options - The engine, the tempo range, `processorUrl` for pages whose CSP refuses `blob:`, `liveInput`
 * for a MediaStream source, and `debug`
 * @returns The analyzer, once its processor has said it is ready
 * @throws {RangeError} When `engine` or `tempoRange` is invalid
 * @throws {TypeError} When `processorUrl`, `liveInput` or `debug` has the wrong type, or a 5.x option is set
 * @throws {Error} When the processor fails to load, or sends no `ready` in time (a stale processor file)
 *
 * @example
 * ```typescript
 * const audioContext = new AudioContext();
 * const analyzer = await createRealtimeBpmAnalyzer(audioContext, {engine: 'peaks'});
 * const source = audioContext.createMediaElementSource(audioElement);
 * source.connect(analyzer.input);
 * source.connect(audioContext.destination);
 *
 * analyzer.on('statechange', ({to}) => {
 *   if (to.status === 'locked') {
 *     console.log('Locked on', to.reading.bpm);
 *   }
 * });
 * analyzer.on('reading', reading => {
 *   console.log(reading.bpm, reading.candidates.map(({bpm, relation}) => `${bpm} (${relation})`));
 * });
 * ```
 *
 * @example
 * **Microphone**
 * ```typescript
 * const stream = await navigator.mediaDevices.getUserMedia({
 *   audio: {echoCancellation: false, noiseSuppression: false, autoGainControl: false},
 * });
 * const [track] = stream.getAudioTracks();
 * const analyzer = await createRealtimeBpmAnalyzer(audioContext, {engine: 'tempogram', liveInput: track});
 * audioContext.createMediaStreamSource(stream).connect(analyzer.input);
 * ```
 *
 * @example
 * **Strict CSP or browser extension (no `blob:` scripts)**
 * ```typescript
 * // Serve dist/realtime-bpm-processor.js (the `realtime-bpm-analyzer/processor` export) yourself
 * const analyzer = await createRealtimeBpmAnalyzer(audioContext, {
 *   processorUrl: '/realtime-bpm-processor.js',
 * });
 * ```
 *
 * @see {@link BpmAnalyzer} for the analyzer's state, events and commands
 * @see {@link analyzeFullBuffer} for a whole file at once
 *
 * @group Functions
 */
export async function createRealtimeBpmAnalyzer(
  audioContext: AudioContext,
  options?: AnalyzerOptions,
): Promise<BpmAnalyzer> {
  // processorUrl and liveInput are main-thread concerns: kept out of the worklet's options, where a URL object
  // or a track would also fail structured cloning.
  assertNoRemovedOptions(options);
  const {processorUrl, liveInput, debug = false} = options ?? {};
  assertProcessorUrl(processorUrl);
  assertLiveInput(liveInput);
  if (typeof debug !== 'boolean') {
    throw new TypeError('debug must be a boolean');
  }

  // Validated here: a throw inside the worklet constructor would not reach the caller
  const {engine, tempoRange} = resolveEngine(options?.engine, options?.tempoRange);
  const processorOptions: ProcessorOptions = {engine, tempoRange, debug, liveInput: liveInput !== undefined, protocol: PROTOCOL};
  const processorNode = await setupAudioWorkletNode(audioContext, realtimeBpmProcessorName, processorOptions, processorUrl);
  // The peaks engine reads the bass: the lowpass sits in front of it, inside `input`
  const analyzer = engine.name === 'tempogram'
    ? constructAnalyzer(processorNode, undefined, liveInput)
    : constructAnalyzer(processorNode, () => {
      const lowpass = getBiquadFilter(audioContext);
      lowpass.connect(processorNode);
      return lowpass;
    }, liveInput);
  await audioContext.resume();
  await whenReady(analyzer);

  return analyzer;
}

/**
 * Rejects a processorUrl that addModule would only refuse later with a less useful error.
 * @param processorUrl Value supplied by the caller
 */
function assertProcessorUrl(processorUrl: unknown): asserts processorUrl is string | URL | undefined {
  if (processorUrl === undefined || processorUrl instanceof URL) {
    return;
  }

  if (typeof processorUrl !== 'string' || processorUrl.trim() === '') {
    throw new TypeError('processorUrl must be a non-empty string or a URL');
  }
}

/**
 * Validates the track before the worklet exists, as a plain JS caller can pass anything. Not `instanceof`: a track
 * made in another frame or the offscreen document of an extension would fail it.
 * @param liveInput The value the caller passed
 */
function assertLiveInput(liveInput: unknown): asserts liveInput is MediaStreamTrack | undefined {
  if (liveInput === undefined) {
    return;
  }

  if (typeof liveInput !== 'object' || liveInput === null || !('kind' in liveInput) || liveInput.kind !== 'audio') {
    throw new TypeError('liveInput must be an audio MediaStreamTrack');
  }
}

/**
 * Creates AudioWorkletNode for the Processor
 * @param audioContext AudioContext instance
 * @param processorName Name of the audio processor, without the extension
 * @param processorOptions The validated settings the worklet receives
 * @param processorUrl Where to load the processor from; an inlined blob: URL when omitted
 * @returns Recording node related components for the app.
 */
async function setupAudioWorkletNode(
  audioContext: AudioContext,
  processorName: string,
  processorOptions: ProcessorOptions,
  processorUrl?: string | URL,
): Promise<AudioWorkletNode> {
  // Only a URL created here is ours to revoke; a caller's URL is left untouched.
  const objectUrl = processorUrl === undefined
    ? URL.createObjectURL(new Blob([realtimeBpmProcessorContent], {type: 'application/javascript'}))
    : undefined;
  const moduleUrl = objectUrl ?? String(processorUrl);

  try {
    await audioContext.audioWorklet.addModule(moduleUrl);

    return new AudioWorkletNode(audioContext, processorName, {
      processorOptions,
    });
  } catch (err) {
    throw new Error(
      `Failed to load realtime-bpm-analyzer worklet: ${err instanceof Error ? err.message : String(err)}`,
      {cause: err},
    );
  } finally {
    if (objectUrl !== undefined) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}
