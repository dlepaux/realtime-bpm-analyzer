import testAnalyzer from './lib/analyzer';
import testRealtimeBpmAnalyzer from './lib/realtime-bpm-analyzer';
import testUtils from './lib/utils';

/**
 * Unit test for the RealTime BPM Analyzer
 */
describe('RealTime BPM Analyzer', () => {
  testAnalyzer();
  testRealtimeBpmAnalyzer();
  testUtils();
});
