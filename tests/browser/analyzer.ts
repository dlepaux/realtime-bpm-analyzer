import {getOfflineLowPassSource} from '../../src/analyzer';
import {expect} from 'chai';

export default () => {
  /**
   * Test Analyzer browser functions
   */
  describe('Analyzer', () => {
    it('should be able to lowpass a file using WebAudioAPI', function (done) {
      fetch('http://localhost:9876/base/tests/fixtures/bass-test.wav').then((response) => {
        const audioContext = new AudioContext();
        response.arrayBuffer().then((buffer) => {
          audioContext.decodeAudioData(buffer).then((audioBuffer: AudioBuffer) => {
            getOfflineLowPassSource(audioBuffer).then((lowpassedAudioBuffer: AudioBuffer) => {
              expect(JSON.stringify(audioBuffer.getChannelData(0))).to.not.be.equal(JSON.stringify(lowpassedAudioBuffer.getChannelData(0)));
              done();
            });
          });
        });
      });
    });
  });
}; 
