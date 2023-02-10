import {expect} from 'chai';
import {createRealTimeBpmProcessor, analyzeFullBuffer} from '../../src/index';

/**
 * Unit test for the RealTime BPM Analyzer
 */
export default () => {
    describe('Index - Unit tests', () => {
        it('should confirm presence of analyzeFullBuffer method', () => {
            expect(typeof analyzeFullBuffer === 'function').to.be.equal(true);
        });
    });

    describe('Index - Intergration tests', () => {
        it('should create a realTimeBpmProcessor', function(done) {
            this.timeout(0);
            const button = window.document.createElement('button');
            button.innerHTML = 'START TESTS';

            button.addEventListener('click', () => {
                console.log('START TESTS');

                window.audioContext = new AudioContext();

                console.log('window.audioContext', window.audioContext);
                createRealTimeBpmProcessor(window.audioContext).then(processor => {
                    expect(processor).to.be.instanceOf(AudioWorkletNode);
                    done();
                }).catch((error: unknown) => {
                    throw error;
                });
            });

            window.document.body.appendChild(button);
        });
    });
};
