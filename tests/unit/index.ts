import * as index from '../../src/index';
import testUtils from './utils';
import testAnalyzer from './analyzer';
import testRealtimeBpmAnalyzer from './realtime-bpm-analyzer';

/**
 * Unit test for the RealTime BPM Analyzer
 */
export default () => {
    describe('Unit tests', () => {
        testAnalyzer();
        testUtils();
        testRealtimeBpmAnalyzer();
        // createRealTimeBpmProcessor
        // setupAudioWorkletNode
    });
};
