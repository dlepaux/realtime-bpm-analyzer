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
              expect(JSON.stringify(audioBuffer)).to.not.be.equal(JSON.stringify(lowpassedAudioBuffer));
              done();
            });
          });
        });
      });
    });

    // it('should be able to lowpass a file using WebAudioAPI', async function () {
    //   this.timeout(10000000);
    //   const browser = await puppeteer.launch(options);
    //   const page = await browser.newPage();

    //   await page.goto('http://localhost:8080');
    //   page.on('console', (event) => console.log('console', event.type(), event.text()));

    //   const server = await prepareServer();

    //   // await page.evaluate(() => {
    //   //   const audioContext = new AudioContext();
    //   //   console.log('fetching');
    //   //   fetch('http://localhost:8080/bass-test.wav').then((response) => {
    //   //     console.log('fetched');
    //   //     response.arrayBuffer().then((buffer) => {
    //   //       global.OfflineAudioContext = window.OfflineAudioContext;
    //   //       console.log('arrayBuffer', window.OfflineAudioContext);
    //   //       window.getOfflineLowPassSource(buffer, window.OfflineAudioContext);
    //   //     });
    //   //   });

    //   //   // audioContext.decodeAudioData(bassTestWav.buffer).then((audioBuffer: AudioBuffer) => {
    //   //   //   analyzer.getOfflineLowPassSource(audioBuffer).then((lowpassedAudioBuffer: AudioBuffer) => {
    //   //   //     console.log(lowpassedAudioBuffer.getChannelData(0));
    //   //   //   });
    //   //   // });
    //   // });

    //   // await page.evaluateHandle(() => {
    //   //   fetch('http://localhost:8080/bass-test.wav').then((response) => {
    //   //     console.log('fetched');
    //   //     console.log('fetched');
    //   //     const audioContext = new AudioContext();
    //   //     response.arrayBuffer().then((buffer) => {
    //   //       audioContext.decodeAudioData(buffer).then((audioBuffer: AudioBuffer) => {
    //   //         analyzer.getOfflineLowPassSource(audioBuffer).then(lowpassedAudioBuffer => {
    //   //           console.log(lowpassedAudioBuffer.getChannelData(0));
    //   //         });
    //   //       });
    //   //     });
    //   //   });
    //   // });

    //   await page.evaluateHandle(() => {
    //     return fetch('http://localhost:8080/bass-test.wav').then((response) => {
    //       console.log('fetched');
    //       console.log('fetched');
    //       const audioContext = new AudioContext();
    //       return response.arrayBuffer().then((buffer) => {
    //         return audioContext.decodeAudioData(buffer).then((audioBuffer: AudioBuffer) => {
    //           console.log('audioBuffer');
    //           return audioBuffer;
    //           // return analyzer.getOfflineLowPassSource(audioBuffer).then(lowpassedAudioBuffer => {
    //           //   console.log(lowpassedAudioBuffer.getChannelData(0));
    //           //   return lowpassedAudioBuffer;
    //           // });
    //         });
    //       });
    //     });
    //   });

    //   await new Promise<void>((resolve, reject) => {
    //     setTimeout(() => resolve(), 100000);
    //   });

    //   await server.close();
    //   await browser.close();
    // });
  }); 
}; 
