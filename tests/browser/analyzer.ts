import {getOfflineLowPassSource} from '../../src/analyzer';
import {expect} from 'chai';

export default () => {
  /**
   * Test Analyzer browser functions
   */
  describe('Analyzer', () => {
    it('should be able to lowpass a file using WebAudioAPI', function (done) {
      fetch('http://127.0.0.1:8080/tests/fixtures/bass-test.wav').then((response) => {
        const audioContext = new AudioContext();
        console.log('fetched');
        response.arrayBuffer().then((buffer) => {
          console.log('buffer', buffer);
          audioContext.decodeAudioData(buffer).then((audioBuffer: AudioBuffer) => {
            console.log('audioBuffer', audioBuffer);
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
