import {findPeaksAtThreshold, identifyIntervals, groupByTempo, getTopCandidates} from './analyzer';
import {descendingOverThresholds} from './utils';
import {minPeaks} from './consts';
import type {Peaks, Tempo} from './types';

export async function analyzeFullBuffer(buffer: AudioBuffer): Promise<Tempo[]> {
  const source = getOfflineLowPassSource(buffer);

  /**
   * Schedule the sound to start playing at time:0
   */

  source.start(0);

  /**
   * Pipe the source through the program
   */
  const channelData = source.buffer.getChannelData(0);
  const peaks = await findPeaks(channelData);
  const intervals = identifyIntervals(peaks);
  const tempos = groupByTempo(buffer.sampleRate, intervals);
  const topCandidates = getTopCandidates(tempos);
  console.log('tempos', tempos);
  console.log('topCandidates', topCandidates);

  return topCandidates;
}

/**
 *
 * @param channelData
 * @returns
 */
async function findPeaks(channelData): Promise<Peaks> {
  let validPeaks: Peaks = [];

  await descendingOverThresholds(async threshold => {
    const {peaks} = findPeaksAtThreshold(channelData, threshold);

    /**
     * Loop over peaks
     */
    if (peaks.length < minPeaks) {
      return false;
    }

    validPeaks = peaks;

    return true;
  });

  return validPeaks;
}

/**
 *
 * @param buffer
 * @returns
 */
function getOfflineLowPassSource(buffer: AudioBuffer): AudioBufferSourceNode {
  const {length, numberOfChannels, sampleRate} = buffer;
  const context = new OfflineAudioContext(numberOfChannels, length, sampleRate);

  /**
   * Create buffer source
   */
  const source = context.createBufferSource();
  source.buffer = buffer;

  /**
   * Create filter
   */
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';

  /**
   * Pipe the song into the filter, and the filter into the offline context
   */

  source.connect(filter);
  filter.connect(context.destination);

  return source;
}

