import {analyzeFullBuffer} from '../../src/analyzer';
import type {Tempo} from '../../src/types';
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
            analyzeFullBuffer(audioBuffer).then((tempo: Tempo[]) => {
              expect(tempo[0].tempo).to.be.equal(126);
              done();
            }).catch(error => done(error));
          });
        });
      });
    });
  });
}; 
