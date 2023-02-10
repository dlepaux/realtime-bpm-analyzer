import testAnalyzer from './lib/analyzer';
import testIndex from './lib/index';
import testRealtimeBpmAnalyzer from './lib/realtime-bpm-analyzer';
import testUtils from './lib/utils';
import {askUserGesture} from './utils';

/**
 * Unit test for the RealTime BPM Analyzer
 */
describe('RealTime BPM Analyzer', () => {
  before(function (done) {
    this.timeout(0);
    askUserGesture(done);
  });

  testAnalyzer();
  testIndex();
  testRealtimeBpmAnalyzer();
  testUtils();
});
