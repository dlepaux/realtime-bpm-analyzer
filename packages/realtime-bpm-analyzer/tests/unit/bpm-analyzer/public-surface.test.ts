import {expect} from 'chai';
import {BpmAnalyzer} from '../../../src/core/bpm-analyzer';
import {createRealtimeBpmAnalyzer} from '../../../src/index';
import {createTestAudioContext, closeAudioContext} from '../../setup';

/**
 * The factory is the only way in, and failing is the analyzer's own business: neither is API a caller could
 * come to depend on (Hyrum's Law) once 6.1.0 ships.
 */
describe('BpmAnalyzer - public surface', function () {
  this.timeout(5000);

  let audioContext: AudioContext;

  beforeEach(() => {
    audioContext = createTestAudioContext();
  });

  afterEach(async () => {
    await closeAudioContext(audioContext);
  });

  it('has no fault method a caller could fail it with', async () => {
    const analyzer = await createRealtimeBpmAnalyzer(audioContext);
    try {
      expect('fault' in analyzer).to.equal(false);
    } finally {
      analyzer.stop();
    }
  });

  it('cannot be built with new, only by the factory', () => {
    // Test double at the boundary: the constructor must refuse before it touches the node
    const node = {port: {postMessage() {/* never reached */}}, context: {currentTime: 0}} as unknown as AudioWorkletNode;
    const Analyzer = BpmAnalyzer as unknown as new (node: AudioWorkletNode) => BpmAnalyzer;

    expect(() => new Analyzer(node)).to.throw(TypeError, /createRealtimeBpmAnalyzer/);
  });
});
