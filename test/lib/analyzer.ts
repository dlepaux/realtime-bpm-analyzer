import {expect} from 'chai';
import {describe, it} from 'mocha';
import {promises} from 'fs';

import {bufferToStream, streamToBlob, readChannelData} from '../utils';

import {data as assertIntervals} from '../fixtures/bass-test-intervals';
import {data as assertTempo} from '../fixtures/bass-test-tempo';

import * as utils from '../../src/utils';
import * as analyzer from '../../src/analyzer';

const assertPeaksBassSample = [
  5994,  16835,  35988,
  63735,  99621, 110236,
  128169, 155902, 191779,
  202406, 225262, 250529,
  282429, 293342, 319926
];

const validThreshold = 0.7999999999999998;

export default () => {
  /**
   * Test Utility functions
   */
  describe('Analyzer.getOfflineLowPassSource', () => {
    it('should find peaks at specific threshold in channel data', async () => {
      const channelData = await readChannelData();
      const {peaks, threshold} = await analyzer.findPeaksAtThreshold(channelData, 0.7999999999999998);

      expect(threshold).to.be.equal(validThreshold);
      expect(JSON.stringify(peaks)).to.be.equal(JSON.stringify(assertPeaksBassSample));
    });

    it('should find peaks from channel data', async () => {
      const channelData = await readChannelData();
      const {peaks, threshold} = await analyzer.findPeaks(channelData);

      expect(threshold).to.be.equal(validThreshold);
      expect(JSON.stringify(peaks)).to.be.equal(JSON.stringify(assertPeaksBassSample));
    });

    it('should identify intervals from peaks', async () => {
      const intervals = analyzer.identifyIntervals(assertPeaksBassSample);
      expect(JSON.stringify(intervals)).to.be.equal(JSON.stringify(assertIntervals));
    });

    it('should group by tempo', async () => {
      const tempo = analyzer.groupByTempo(44100, assertIntervals);
      expect(JSON.stringify(tempo)).to.be.equal(JSON.stringify(assertTempo));
    });

    it('should test threshold value with stop call', async () => {
      const validPeaks = utils.generateValidPeaksModel();
      validPeaks[validThreshold] = assertPeaksBassSample;
      const data = await analyzer.computeBpm(validPeaks, 44100);
      console.log('data', data);
      // expect(threshold).to.be.equal(validThreshold);
      // expect(JSON.stringify(peaks)).to.be.equal(JSON.stringify(assertPeaksBassSample));
    });
  });

  // export function findPeaksAtThreshold(data: Float32Array, threshold: Threshold, offset = 0, skipForwardIndexes = consts.skipForwardIndexes): PeaksAndThreshold {
  // export async function findPeaks(channelData: Float32Array): Promise<PeaksAndThreshold> {
  // export async function getOfflineLowPassSource(buffer: AudioBuffer): Promise<AudioBuffer> {
  // export async function computeBpm(data: ValidPeaks, audioSampleRate: number, minPeaks = consts.minPeaks): Promise<BpmCandidates> {
  // export function getTopCandidates(candidates: Tempo[], length = 5): Tempo[] {
  // export function getTopCandidate(candidates: Tempo[]): number {
  // export function identifyIntervals(peaks: Peaks): Interval[] {
  // export function groupByTempo(audioSampleRate: number, intervalCounts: Interval[]): Tempo[] {
};
