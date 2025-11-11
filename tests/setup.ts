import type {ProcessorOutputEvent, BpmAnalyzer, BpmAnalyzerEventMap} from '../src';

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

/**
 * Event collector utility for capturing processor output events.
 * @example
 * ```typescript
 * const collector = createEventCollector();
 *
 * await analyzer.analyzeChunk({
 *   audioSampleRate: 44100,
 *   channelData,
 *   bufferSize: 4096,
 *   postMessage: collector.postMessage,
 * });
 *
 * const bpmEvents = collector.getEventsByType('bpm');
 * expect(bpmEvents.length).to.be.greaterThan(0);
 * ```
 */
export type EventCollector = {
  /** Function to pass as postMessage callback */
  postMessage: (data: ProcessorOutputEvent) => void;
  /** All collected events */
  events: ProcessorOutputEvent[];
  /** Get events filtered by type */
  getEventsByType: <T extends ProcessorOutputEvent['type']>(
    type: T
  ) => Array<Extract<ProcessorOutputEvent, {type: T}>>;
  /** Clear all collected events */
  clear: () => void;
};

/**
 * Creates a mock postMessage function that collects events.
 * @returns An event collector with helper methods
 * @example
 * ```typescript
 * const collector = createEventCollector();
 *
 * // Use in analyzeChunk
 * postMessage: collector.postMessage
 *
 * // Get specific events
 * const bpmEvents = collector.getEventsByType('bpm');
 * const stableEvents = collector.getEventsByType('bpmStable');
 *
 * // Clear for next test
 * collector.clear();
 * ```
 */
export function createEventCollector(): EventCollector {
  const events: ProcessorOutputEvent[] = [];

  const postMessage = (data: ProcessorOutputEvent) => {
    events.push(data);
  };

  const getEventsByType = <T extends ProcessorOutputEvent['type']>(
    type: T,
  ): Array<Extract<ProcessorOutputEvent, {type: T}>> => events.filter(e => e.type === type) as Array<Extract<ProcessorOutputEvent, {type: T}>>;

  const clear = () => {
    events.length = 0;
  };

  return {
    postMessage,
    events,
    getEventsByType,
    clear,
  };
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
 * Waits for a specific event to be emitted from a BpmAnalyzer.
 * @param analyzer - The BpmAnalyzer instance
 * @param eventType - The event type to wait for
 * @param timeout - Maximum time to wait in milliseconds (default: 5000)
 * @returns Promise resolving to the event data
 * @throws Error if timeout is reached before event is emitted
 * @example
 * ```typescript
 * const analyzer = await createRealTimeBpmProcessor(audioContext);
 *
 * // Start audio processing...
 * source.connect(analyzer);
 * analyzer.connect(audioContext.destination);
 *
 * // Wait for stable BPM detection
 * const stableData = await waitForEvent(analyzer, 'bpmStable', 10000);
 * console.log('Stable BPM:', stableData.bpm[0].tempo);
 * ```
 */
export async function waitForEvent<T extends keyof BpmAnalyzerEventMap>(
  analyzer: BpmAnalyzer,
  eventType: T,
  timeout = 5000,
): Promise<BpmAnalyzerEventMap[T]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for ${eventType} event after ${timeout}ms`));
    }, timeout);

    analyzer.once(eventType, data => {
      clearTimeout(timer);
      resolve(data);
    });
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
