import type {AnalyzerEventMap, AnalyzerEventType, BpmAnalyzer} from '../src';
import type {WorkletMessage} from '../src/contract/types';
import type {Session} from '../src/core/session';

/**
 * Creates a properly initialized AudioContext for testing.
 * @returns A new AudioContext instance
 * @example
 * ```typescript
 * const audioContext = createTestAudioContext();
 * // Use in tests...
 * await closeAudioContext(audioContext);
 * ```
 */
export function createTestAudioContext(): AudioContext {
  return new AudioContext();
}

/**
 * Safely closes an AudioContext if it's not already closed.
 * @param ctx - The AudioContext to close
 * @example
 * ```typescript
 * afterEach(async () => {
 *   await closeAudioContext(audioContext);
 * });
 * ```
 */
export async function closeAudioContext(ctx: AudioContext): Promise<void> {
  if (ctx.state !== 'closed') {
    await ctx.close();
  }
}

/** A worklet message, with the seconds of audio the session had been fed when it was sent */
export type TimedMessage = {readonly message: WorkletMessage; readonly heard: number};

/**
 * Feeds PCM to a session in buffers, as the processor does once its aggregator is full
 * @param session The session under test
 * @param pcm The samples
 * @param sampleRate Their rate
 * @param bufferSize Samples per analysis, the aggregator's by default
 * @returns Every message, in order
 */
export async function feedSession(session: Session, pcm: Float32Array, sampleRate: number, bufferSize = 4096): Promise<TimedMessage[]> {
  const messages: TimedMessage[] = [];
  for (let start = 0; start + bufferSize <= pcm.length; start += bufferSize) {
    const heard = (start + bufferSize) / sampleRate;
    const step = await session.analyze(pcm.subarray(start, start + bufferSize), bufferSize, sampleRate);
    messages.push(...step.map(message => ({message, heard})));
  }

  return messages;
}

/**
 * @param messages What a session sent
 * @returns The steps among them
 */
export function stepsOf(messages: readonly TimedMessage[]): Array<Extract<WorkletMessage, {type: 'step'}>> {
  return messages.flatMap(({message}) => message.type === 'step' ? [message] : []);
}

/**
 * Loads the test audio fixture (bass-test.wav).
 * @param ctx - AudioContext for decoding
 * @returns Promise resolving to AudioBuffer
 * @example
 * ```typescript
 * const audioContext = createTestAudioContext();
 * const audioBuffer = await loadTestAudio(audioContext);
 * const tempos = await analyzeFullBuffer(audioBuffer);
 * ```
 */
export async function loadTestAudio(ctx: AudioContext): Promise<AudioBuffer> {
  const response = await fetch('/tests/fixtures/bass-test.wav');
  const buffer = await response.arrayBuffer();
  return ctx.decodeAudioData(buffer);
}

/**
 * Converts an AudioBuffer into chunks for testing streaming analysis.
 * @param audioBuffer - The audio buffer to chunk
 * @param bufferSize - Size of each chunk (default: 4096)
 * @returns Array of Float32Array chunks
 * @example
 * ```typescript
 * const audioBuffer = await loadTestAudio(audioContext);
 * const chunks = audioBufferToChunks(audioBuffer, 4096);
 *
 * for (const chunk of chunks) {
 *   await analyzer.analyzeChunk({
 *     audioSampleRate: audioContext.sampleRate,
 *     channelData: chunk,
 *     bufferSize: 4096,
 *     postMessage: collector.postMessage,
 *   });
 * }
 * ```
 */
export function audioBufferToChunks(
  audioBuffer: AudioBuffer,
  bufferSize = 4096,
): Float32Array[] {
  const channelData = audioBuffer.getChannelData(0);
  const chunks: Float32Array[] = [];

  for (let i = 0; i < channelData.length; i += bufferSize) {
    const end = Math.min(i + bufferSize, channelData.length);
    const chunk = channelData.slice(i, end);
    chunks.push(chunk);
  }

  return chunks;
}

/**
 * Waits for one event of an analyzer
 * @param analyzer - The analyzer
 * @param eventType - The event to wait for
 * @param timeout - How long to wait, in milliseconds
 * @returns The event's payload
 */
export async function waitForEvent<T extends AnalyzerEventType>(
  analyzer: BpmAnalyzer,
  eventType: T,
  timeout = 5000,
): Promise<AnalyzerEventMap[T]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for ${eventType} event after ${timeout}ms`));
    }, timeout);

    analyzer.on(eventType, data => {
      clearTimeout(timer);
      resolve(data);
    }, {once: true});
  });
}

/**
 * Creates synthetic audio data with a regular beat pattern.
 * Useful for testing BPM detection with known tempos without requiring audio files.
 * @param bpm - Beats per minute to generate
 * @param durationSeconds - Duration of the audio in seconds
 * @param sampleRate - Sample rate (default: 44100)
 * @param peakAmplitude - Amplitude of beat peaks (default: 0.8)
 * @returns Float32Array containing synthetic beat pattern
 * @example
 * ```typescript
 * // Create 10 seconds of 120 BPM beat
 * const beat = createSyntheticBeat(120, 10, 44100);
 *
 * const {peaks} = await findPeaks({
 *   audioSampleRate: 44100,
 *   channelData: beat,
 * });
 * ```
 */
export function createSyntheticBeat(
  bpm: number,
  durationSeconds: number,
  sampleRate = 44100,
  peakAmplitude = 0.8,
): Float32Array {
  const totalSamples = Math.floor(durationSeconds * sampleRate);
  const data = new Float32Array(totalSamples);

  // Calculate samples between beats
  const secondsPerBeat = 60 / bpm;
  const samplesPerBeat = Math.floor(secondsPerBeat * sampleRate);

  // Peak duration (50ms)
  const peakDurationSamples = Math.floor(0.05 * sampleRate);

  // Create beats at regular intervals
  for (let i = 0; i < totalSamples; i++) {
    const positionInBeat = i % samplesPerBeat;

    if (positionInBeat < peakDurationSamples) {
      // Create a peak with slight envelope
      const envelope = 1 - (positionInBeat / peakDurationSamples);
      data[i] = peakAmplitude * envelope;
    } else {
      // Silence or low background
      data[i] = 0;
    }
  }

  return data;
}

/**
 * Creates synthetic audio data with varying tempo for testing tempo changes.
 * @param startBpm - Initial BPM
 * @param endBpm - Final BPM
 * @param durationSeconds - Duration of the audio in seconds
 * @param sampleRate - Sample rate (default: 44100)
 * @returns Float32Array containing varying tempo beat pattern
 * @example
 * ```typescript
 * // Create beat that accelerates from 100 to 140 BPM
 * const beat = createSyntheticBeatWithTempoChange(100, 140, 20, 44100);
 * ```
 */
export function createSyntheticBeatWithTempoChange(
  startBpm: number,
  endBpm: number,
  durationSeconds: number,
  sampleRate = 44100,
): Float32Array {
  const totalSamples = Math.floor(durationSeconds * sampleRate);
  const data = new Float32Array(totalSamples);

  const peakDurationSamples = Math.floor(0.05 * sampleRate);
  let nextBeatSample = 0;

  for (let i = 0; i < totalSamples; i++) {
    if (i >= nextBeatSample) {
      // Create a peak
      const peakEnd = Math.min(i + peakDurationSamples, totalSamples);
      for (let j = i; j < peakEnd; j++) {
        const envelope = 1 - ((j - i) / peakDurationSamples);
        data[j] = 0.8 * envelope;
      }

      // Calculate next beat position with tempo change
      const progress = i / totalSamples;
      const currentBpm = startBpm + ((endBpm - startBpm) * progress);
      const secondsPerBeat = 60 / currentBpm;
      const samplesPerBeat = Math.floor(secondsPerBeat * sampleRate);
      nextBeatSample = i + samplesPerBeat;

      i = peakEnd - 1; // Skip ahead past this peak
    }
  }

  return data;
}

/**
 * Creates silent audio data for testing edge cases.
 * @param samples - Number of samples
 * @returns Float32Array of zeros
 * @example
 * ```typescript
 * const silent = createSilentAudio(4096);
 * const {peaks} = await findPeaks({
 *   audioSampleRate: 44100,
 *   channelData: silent,
 * });
 * expect(peaks.length).to.equal(0);
 * ```
 */
export function createSilentAudio(samples: number): Float32Array {
  return new Float32Array(samples);
}

/**
 * Creates audio data with constant amplitude (no peaks).
 * @param samples - Number of samples
 * @param amplitude - Constant amplitude value (default: 0.1)
 * @returns Float32Array with constant values
 * @example
 * ```typescript
 * const flat = createFlatAudio(4096, 0.2);
 * // Should not detect any peaks since there's no variation
 * ```
 */
export function createFlatAudio(samples: number, amplitude = 0.1): Float32Array {
  return new Float32Array(samples).fill(amplitude);
}

/**
 * Creates audio data with random noise.
 * @param samples - Number of samples
 * @param amplitude - Maximum amplitude (default: 0.5)
 * @returns Float32Array with random values
 * @example
 * ```typescript
 * const noise = createNoiseAudio(4096);
 * // Should not detect reliable BPM from white noise
 * ```
 */
export function createNoiseAudio(samples: number, amplitude = 0.5): Float32Array {
  const data = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    data[i] = ((Math.random() * 2) - 1) * amplitude;
  }

  return data;
}
