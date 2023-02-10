import {realtimeBpmProcessorName} from './consts';

export * from './realtime-bpm-analyzer';
export {analyzeFullBuffer} from './analyzer';
export * from './types';

/**
 * Create the RealTimeBpmProcessor needed to run the realtime strategy
 * ENsure that the biquad lowpass filter is done before using this library
 * @param {AudioContext} audioContext AudioContext instance
 * @returns {Promise<AudioWorkletNode>}
 * @public
 */
export async function createRealTimeBpmProcessor(audioContext: AudioContext): Promise<AudioWorkletNode> {
  const processorNode = await setupAudioWorkletNode(audioContext, `dist/${realtimeBpmProcessorName}`);

  await audioContext.resume();

  return processorNode;
}

/**
 * Creates AudioWorkletNode for the Processor
 * @param {AudioContext} audioContext AudioContext instance
 * @param {string} processorName Name of the audio processor, without the extension
 * @return {Promise<AudioWorkletNode>} Recording node related components for the app.
 * @private
 */
async function setupAudioWorkletNode(audioContext: AudioContext, processorName: string): Promise<AudioWorkletNode> {
  try {
    console.log('hey', `./${processorName}.js`);
    await audioContext.audioWorklet.addModule(`./${processorName}.js`);
    console.log('hey1');

    const audioWorkletNode = new AudioWorkletNode(audioContext, processorName);
    console.log('hey2');

    return audioWorkletNode;
  } catch (error: unknown) {
    console.log(error);
    throw error;
  }
}
