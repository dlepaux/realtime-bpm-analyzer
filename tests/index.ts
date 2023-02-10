import testAnalyzer from './lib/analyzer';
import testIndex from './lib/index';
import testRealtimeBpmAnalyzer from './lib/realtime-bpm-analyzer';
import testUtils from './lib/utils';

/**
 * Unit test for the RealTime BPM Analyzer
 */
describe('RealTime BPM Analyzer', () => {
  testAnalyzer();
  testIndex();
  testRealtimeBpmAnalyzer();
  testUtils();
});
