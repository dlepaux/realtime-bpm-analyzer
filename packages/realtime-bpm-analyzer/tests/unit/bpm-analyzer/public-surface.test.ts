import {expect} from 'chai';
import {BpmAnalyzer} from '../../../src/core/bpm-analyzer';
import {createRealtimeBpmAnalyzer} from '../../../src/index';
import {createTestAudioContext, closeAudioContext} from '../../setup';

/** Only the factory builds an analyzer, and only the analyzer fails itself */
describe('BpmAnalyzer - public surface', function () {
  this.timeout(5000);

  let audioContext: AudioContext;

  beforeEach(() => {
    audioContext = createTestAudioContext();
  });

  afterEach(async () => {
    await closeAudioContext(audioContext);
  });

  it('has no fault method', async () => {
    const analyzer = await createRealtimeBpmAnalyzer(audioContext);
    try {
      expect('fault' in analyzer).to.equal(false);
    } finally {
      analyzer.stop();
    }
  });

  it('refuses new', () => {
    // A bare node: the constructor throws before it uses one
    const node = {port: {postMessage() {/* never reached */}}, context: {currentTime: 0}} as unknown as AudioWorkletNode;
    const Analyzer = BpmAnalyzer as unknown as new (node: AudioWorkletNode) => BpmAnalyzer;

    expect(() => new Analyzer(node)).to.throw(TypeError, /createRealtimeBpmAnalyzer/);
  });
});
