import {realtimeBpmProcessorName} from './core/consts';
import realtimeBpmProcessorContent from './generated-processor';
import {type RealTimeBpmAnalyzerParameters} from './core/types';

export * from './core/realtime-bpm-analyzer';
export {analyzeFullBuffer, getBiquadFilter} from './core/analyzer';
export * from './core/types';

/**
 * Creates a real-time BPM analyzer processor for live audio streams.
 *
 * This function sets up an AudioWorkletNode that analyzes audio in real-time
 * to detect the beats-per-minute (tempo) of streaming audio sources like
 * microphones, audio elements, or live streams.
 *
 * @param audioContext - The Web Audio API AudioContext to use for processing
 * @param processorOptions - Optional configuration parameters for the analyzer
 * @returns A promise that resolves to an AudioWorkletNode configured for BPM analysis
 *
 * @example
 * **Basic Usage with Microphone**
 * ```typescript
 * const audioContext = new AudioContext();
 * const analyzer = await createRealTimeBpmProcessor(audioContext);
 *
 * // Connect microphone
 * const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
 * const source = audioContext.createMediaStreamSource(stream);
 * source.connect(analyzer);
 * analyzer.connect(audioContext.destination);
 *
 * // Listen for BPM events
 * analyzer.port.onmessage = (event) => {
 *   if (event.data.message === 'BPM') {
 *     console.log('Current BPM:', event.data.data.bpm[0].tempo);
 *   }
 * };
 * ```
 *
 * @example
 * **With Custom Configuration**
 * ```typescript
 * const audioContext = new AudioContext();
 * const analyzer = await createRealTimeBpmProcessor(audioContext, {
 *   continuousAnalysis: true,    // Keep analyzing after stable BPM found
 *   stabilizationTime: 20000,    // Time in ms to consider BPM stable
 *   muteTimeInIndexes: 10000,    // Audio indexes to skip between peaks
 *   debug: false                 // Enable debug logging
 * });
 * ```
 *
 * @example
 * **With Audio Element**
 * ```typescript
 * const audioContext = new AudioContext();
 * const analyzer = await createRealTimeBpmProcessor(audioContext);
 *
 * const audioElement = document.querySelector('audio');
 * const source = audioContext.createMediaElementSource(audioElement);
 * source.connect(analyzer);
 * analyzer.connect(audioContext.destination);
 *
 * // Handle BPM events
 * analyzer.port.onmessage = (event) => {
 *   switch (event.data.message) {
 *     case 'BPM':
 *       console.log('Analyzing:', event.data.data.bpm[0].tempo);
 *       break;
 *     case 'BPM_STABLE':
 *       console.log('Stable BPM detected:', event.data.data.bpm[0].tempo);
 *       console.log('Confidence:', event.data.data.bpm[0].confidence);
 *       break;
 *   }
 * };
 * ```
 *
 * @remarks
 * - The analyzer uses AudioWorklet technology for efficient real-time processing
 * - BPM events are posted via the processor's message port
 * - Two event types are emitted: 'BPM' (continuous) and 'BPM_STABLE' (when stabilized)
 * - The processor must be connected between an audio source and destination
 * - For offline/synchronous analysis of audio files, use {@link analyzeFullBuffer} instead
 *
 * @see {@link analyzeFullBuffer} for offline audio file analysis
 * @see {@link RealTimeBpmAnalyzerParameters} for configuration options
 * @see {@link BpmCandidates} for the structure of BPM results
 *
 * @group Functions
 */
export async function createRealTimeBpmProcessor(audioContext: AudioContext, processorOptions?: RealTimeBpmAnalyzerParameters): Promise<AudioWorkletNode> {
  const processorNode = await setupAudioWorkletNode(audioContext, realtimeBpmProcessorName, processorOptions);

  await audioContext.resume();

  return processorNode;
}

/**
 * Creates AudioWorkletNode for the Processor
 * @param audioContext AudioContext instance
 * @param processorName Name of the audio processor, without the extension
 * @param processorOptions RealTimeBpmAnalyzerParameters
 * @returns Recording node related components for the app.
 */
async function setupAudioWorkletNode(audioContext: AudioContext, processorName: string, processorOptions?: RealTimeBpmAnalyzerParameters): Promise<AudioWorkletNode> {
  const blob = new Blob([realtimeBpmProcessorContent], {type: 'application/javascript'});

  const objectUrl = URL.createObjectURL(blob);

  await audioContext.audioWorklet.addModule(objectUrl);

  const audioWorkletNode = new AudioWorkletNode(audioContext, processorName, {
    processorOptions,
  });

  return audioWorkletNode;
}
