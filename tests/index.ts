import testUnit from './unit/index';
import testBrowser from './browser/index';

/**
 * Unit test for the RealTime BPM Analyzer
 */
describe('RealTime BPM Analyzer', () => {
  testUnit();
  testBrowser();
});
