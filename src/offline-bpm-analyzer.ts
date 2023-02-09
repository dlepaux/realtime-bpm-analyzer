import {getOfflineLowPassSource, findPeaks, identifyIntervals, groupByTempo, getTopCandidates} from './analyzer';
import type {Tempo} from './types';

/**
 * Function to detect the BPM from an AudioBuffer (which can be a whole file)
 * It is the fastest way to detect the BPM
 * @param {AudioBuffer} buffer AudioBuffer
 * @param {boolean} debug If enabled, it will capture the PCM data and the peaks used to compute the BPM
 * @returns {Promise<Tempo[]>} Returns the 5 bests candidates
 */
export async function analyzeFullBuffer(buffer: AudioBuffer, debug = false): Promise<Tempo[]> {
  const sourceBuffer = await getOfflineLowPassSource(buffer);

  /**
   * Pipe the source through the program
   */
  const channelData = sourceBuffer.getChannelData(0);

  console.log('channelData', JSON.stringify(channelData, undefined, 2));

  const {peaks, threshold} = await findPeaks(channelData);

  if (debug) {
    console.debug({peaks, threshold});
    // Console.log('PCM DATA', JSON.stringify(Object.keys(channelData).map(key => ({index: key, value: channelData[key]})), undefined, 2));
  }

  const intervals = identifyIntervals(peaks);
  const tempos = groupByTempo(buffer.sampleRate, intervals);
  const topCandidates = getTopCandidates(tempos, channelData.length);

  return topCandidates;
}
