import {expect} from 'chai';
import {createRealTimeBpmProcessor, analyzeFullBuffer, getBiquadFilters} from '../../src/index';
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
        it('should create a realTimeBpmProcessor', function(done: Mocha.Done) {
            this.timeout(30 * 1000);
            askUserGesture(async (audioContext: AudioContext) => { // Path: /base/processor/realtime-bpm-processor.js
                const processor = await createRealTimeBpmProcessor(audioContext, `/base/processor/${realtimeBpmProcessorName}.js`);
                expect(processor).to.be.instanceOf(AudioWorkletNode);
                await audioContext.close();
                done();
            })
        });

        it('should not create a realTimeBpmProcessor', function(done: Mocha.Done) {
            this.timeout(30 * 1000);
            askUserGesture(async (audioContext: AudioContext) => {
                try {
                    await createRealTimeBpmProcessor(audioContext);
                } catch (error) {
                    await audioContext.close();
                    done();
                }
            })
        });

        it('should create the biquad filters', function(done: Mocha.Done) {
            this.timeout(30 * 1000);
            askUserGesture(async (audioContext: AudioContext) => {
                const {lowpass, highpass} = await getBiquadFilters(audioContext);
                expect(lowpass).to.be.instanceOf(BiquadFilterNode);
                expect(highpass).to.be.instanceOf(BiquadFilterNode);
                await audioContext.close();
                done();
            })
        });
    });
};
