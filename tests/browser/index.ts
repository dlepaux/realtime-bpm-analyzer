import testAnalyzer from './analyzer';

/**
 * Browser tests for the RealTime BPM Analyzer
 * Tests should be run: http://localhost:8080/tests
 */
export default () => {
    describe('Browser tests', () => {
        testAnalyzer();
    });
};
