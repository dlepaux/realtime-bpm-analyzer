import testAnalyzer from './lib/analyzer';
import testIndex from './lib/index';
import testRealtimeBpmAnalyzer from './lib/realtime-bpm-analyzer';
import testUtils from './lib/utils';

/**
 * Unit test for the RealTime BPM Analyzer
 */
describe('RealTime BPM Analyzer', () => {
  // before(function (done) {
  //   this.timeout(0);
  //   const button = window.document.createElement('button');
  //   button.innerHTML = 'START TESTS';

  //   button.addEventListener('click', () => {
  //     console.log('START TESTS');
  //     window.audioContext = new AudioContext();
  //     console.log('window.audioContext', window.audioContext);
  //     testIndex();
  //     done();
  //   });

  //   window.document.body.appendChild(button);
  // });

  // testAnalyzer();
  testIndex();
  // testRealtimeBpmAnalyzer();
  // testUtils();
});
