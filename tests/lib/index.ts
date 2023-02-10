import {expect} from 'chai';
import {createRealTimeBpmProcessor, analyzeFullBuffer} from '../../src/index';
import { askUserGesture } from '../utils';
import {realtimeBpmProcessorName} from '../../src/consts';

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
            askUserGesture(() => {
                if (!window.audioContext) return done(new Error("No AudioContext"));

                createRealTimeBpmProcessor(window.audioContext, `/dist/${realtimeBpmProcessorName}.js`).then(processor => {
                    expect(processor).to.be.instanceOf(AudioWorkletNode);
                    done();
                }).catch((error: unknown) => {
                    throw error;
                });
            })
        });

        it('should not create a realTimeBpmProcessor', function(done) {
            this.timeout(0);
            askUserGesture(() => {
                if (!window.audioContext) return done(new Error("No AudioContext"));

                createRealTimeBpmProcessor(window.audioContext).then(() => {
                    throw new Error('Should not succeed, the processor does not exists at this location');
                }).catch((error: unknown) => {
                    done();
                });
            })
        });
    });
};
