import {realtimeBpmProcessorName} from './core/consts';
import realtimeBpmProcessorContent from './generated-processor';
import {type RealTimeBpmAnalyzerParameters} from './core/types';
import {BpmAnalyzer} from './core/bpm-analyzer';

export * from './core/realtime-bpm-analyzer';
export {analyzeFullBuffer, getBiquadFilter} from './core/analyzer';
export * from './core/types';
export {BpmAnalyzer} from './core/bpm-analyzer';

/**
 * Creates a real-time BPM analyzer for live audio streams.
 *
 * This function sets up a BPM analyzer that processes audio in real-time
 * to detect the beats-per-minute (tempo) of streaming audio sources like
 * microphones, audio elements, or live streams.
 *
 * @param audioContext - The Web Audio API AudioContext to use for processing
 * @param processorOptions - Optional configuration parameters for the analyzer
 * @returns A promise that resolves to a BpmAnalyzer instance with typed event listeners
 *
 * @example
 * **Basic Usage with Microphone**
 * ```typescript
 * const audioContext = new AudioContext();
 * const analyzer = await createRealTimeBpmProcessor(audioContext);
 *
 * // Listen for BPM events with full type safety
 * analyzer.on('bpm', (data) => {
 *   console.log('Current BPM:', data.bpm[0].tempo);
 *   console.log('Confidence:', data.bpm[0].confidence);
 * });
 *
 * analyzer.on('bpmStable', (data) => {
 *   console.log('Stable BPM detected:', data.bpm[0].tempo);
 * });
 *
 * // Connect microphone
 * const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
 * const source = audioContext.createMediaStreamSource(stream);
 * source.connect(analyzer);
 * analyzer.connect(audioContext.destination);
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
 * // Handle different event types
 * analyzer.on('bpm', (data) => {
 *   console.log('Analyzing:', data.bpm[0].tempo);
 * });
 *
 * analyzer.on('bpmStable', (data) => {
 *   console.log('Stable BPM:', data.bpm[0].tempo);
 *   console.log('Confidence:', data.bpm[0].confidence);
 * });
 *
 * // One-time listener
 * analyzer.once('bpmStable', (data) => {
 *   console.log('First stable detection!');
 * });
 * ```
 *
 * @example
 * **Controlling the Analyzer**
 * ```typescript
 * // Reset the analyzer state
 * analyzer.reset();
 *
 * // Listen for reset events
 * analyzer.on('analyzerReset', () => {
 *   console.log('Analyzer was reset');
 * });
 *
 * // Stop the analyzer
 * analyzer.stop();
 *
 * // Remove listeners with native API
 * const handler = (event) => console.log(event.detail);
 * analyzer.addEventListener('bpm', handler);
 * analyzer.removeEventListener('bpm', handler);
 *
 * // Or use once() for automatic cleanup
 * analyzer.once('bpmStable', (data) => console.log('First detection'));
 *
 * // Disconnect and cleanup
 * analyzer.disconnect();
 * ```
 *
 * @remarks
 * - The analyzer uses AudioWorklet technology for efficient real-time processing
 * - Events are emitted via a typed EventEmitter with full autocomplete support
 * - Event types: 'bpm' (continuous), 'bpmStable' (when stabilized), 'analyzerReset'
 * - The analyzer can be connected in Web Audio API graphs like any AudioNode
 * - For offline/synchronous analysis of audio files, use {@link analyzeFullBuffer} instead
 *
 * @see {@link BpmAnalyzer} for the analyzer class API
 * @see {@link analyzeFullBuffer} for offline audio file analysis
 * @see {@link RealTimeBpmAnalyzerParameters} for configuration options
 * @see {@link BpmCandidates} for the structure of BPM results
 *
 * @group Functions
 */
export async function createRealTimeBpmProcessor(audioContext: AudioContext, processorOptions?: RealTimeBpmAnalyzerParameters): Promise<BpmAnalyzer> {
  const processorNode = await setupAudioWorkletNode(audioContext, realtimeBpmProcessorName, processorOptions);
  await audioContext.resume();
  return new BpmAnalyzer(processorNode);
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

  try {
    await audioContext.audioWorklet.addModule(objectUrl);

    const audioWorkletNode = new AudioWorkletNode(audioContext, processorName, {
      processorOptions,
    });

    return audioWorkletNode;
  } finally {
    // Clean up the blob URL to prevent memory leaks
    URL.revokeObjectURL(objectUrl);
  }
}
