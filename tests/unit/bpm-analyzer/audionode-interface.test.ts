import {expect} from 'chai';
import {createRealtimeBpmAnalyzer} from '../../../src/index';
import {createTestAudioContext, closeAudioContext} from '../../setup';

/**
 * Unit tests for BpmAnalyzer AudioNode interface accessors
 * Tests that BpmAnalyzer properly proxies AudioNode properties
 */
describe('BpmAnalyzer - AudioNode Interface', function () {
  this.timeout(5000);

  let audioContext: AudioContext;

  beforeEach(() => {
    audioContext = createTestAudioContext();
  });

  afterEach(async () => {
    await closeAudioContext(audioContext);
  });

  describe('readonly properties', () => {
    it('should expose context property', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);
      expect(analyzer.context).to.equal(audioContext);
    });

    it('should expose numberOfInputs property', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);
      expect(analyzer.numberOfInputs).to.be.a('number');
      expect(analyzer.numberOfInputs).to.equal(1);
    });

    it('should expose numberOfOutputs property', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);
      expect(analyzer.numberOfOutputs).to.be.a('number');
      expect(analyzer.numberOfOutputs).to.equal(1);
    });
  });

  describe('channelCount property', () => {
    it('should get channelCount from underlying node', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);
      const channelCount = analyzer.channelCount;

      expect(channelCount).to.be.a('number');
      expect(channelCount).to.be.greaterThan(0);
      expect(channelCount).to.equal(analyzer.node.channelCount);
    });

    it('should set channelCount on underlying node', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);

      analyzer.channelCount = 2;

      expect(analyzer.node.channelCount).to.equal(2);
      expect(analyzer.channelCount).to.equal(2);
    });

    it('should accept valid channel count values', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);

      const validValues = [1, 2];
      for (const value of validValues) {
        analyzer.channelCount = value;
        expect(analyzer.channelCount).to.equal(value);
      }
    });

    it('should proxy channelCount changes bidirectionally', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);

      // Set via analyzer
      analyzer.channelCount = 2;
      expect(analyzer.node.channelCount).to.equal(2);

      // Set via node
      analyzer.node.channelCount = 1;
      expect(analyzer.channelCount).to.equal(1);
    });
  });

  describe('channelCountMode property', () => {
    it('should get channelCountMode from underlying node', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);
      const mode = analyzer.channelCountMode;

      expect(mode).to.be.a('string');
      expect(['max', 'clamped-max', 'explicit']).to.include(mode);
      expect(mode).to.equal(analyzer.node.channelCountMode);
    });

    it('should set channelCountMode on underlying node', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);

      analyzer.channelCountMode = 'explicit';

      expect(analyzer.node.channelCountMode).to.equal('explicit');
      expect(analyzer.channelCountMode).to.equal('explicit');
    });

    it('should accept all valid channel count modes', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);

      const validModes: ChannelCountMode[] = ['max', 'clamped-max', 'explicit'];
      for (const mode of validModes) {
        analyzer.channelCountMode = mode;
        expect(analyzer.channelCountMode).to.equal(mode);
      }
    });

    it('should proxy channelCountMode changes bidirectionally', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);

      // Set via analyzer
      analyzer.channelCountMode = 'explicit';
      expect(analyzer.node.channelCountMode).to.equal('explicit');

      // Set via node
      analyzer.node.channelCountMode = 'max';
      expect(analyzer.channelCountMode).to.equal('max');
    });
  });

  describe('channelInterpretation property', () => {
    it('should get channelInterpretation from underlying node', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);
      const interpretation = analyzer.channelInterpretation;

      expect(interpretation).to.be.a('string');
      expect(['speakers', 'discrete']).to.include(interpretation);
      expect(interpretation).to.equal(analyzer.node.channelInterpretation);
    });

    it('should set channelInterpretation on underlying node', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);

      analyzer.channelInterpretation = 'discrete';

      expect(analyzer.node.channelInterpretation).to.equal('discrete');
      expect(analyzer.channelInterpretation).to.equal('discrete');
    });

    it('should accept all valid channel interpretations', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);

      const validInterpretations: ChannelInterpretation[] = ['speakers', 'discrete'];
      for (const interpretation of validInterpretations) {
        analyzer.channelInterpretation = interpretation;
        expect(analyzer.channelInterpretation).to.equal(interpretation);
      }
    });

    it('should proxy channelInterpretation changes bidirectionally', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);

      // Set via analyzer
      analyzer.channelInterpretation = 'discrete';
      expect(analyzer.node.channelInterpretation).to.equal('discrete');

      // Set via node
      analyzer.node.channelInterpretation = 'speakers';
      expect(analyzer.channelInterpretation).to.equal('speakers');
    });
  });

  describe('integration with audio graph', () => {
    it('should work in audio graph with custom channel configuration', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);

      // Configure channels
      analyzer.channelCount = 2;
      analyzer.channelCountMode = 'explicit';
      analyzer.channelInterpretation = 'discrete';

      // Connect to destination
      expect(() => {
        analyzer.connect(audioContext.destination);
      }).to.not.throw();

      // Verify configuration persists
      expect(analyzer.channelCount).to.equal(2);
      expect(analyzer.channelCountMode).to.equal('explicit');
      expect(analyzer.channelInterpretation).to.equal('discrete');

      analyzer.disconnect();
    });

    it('should maintain channel settings after connect/disconnect', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);

      analyzer.channelCount = 2;
      analyzer.channelCountMode = 'explicit';

      analyzer.connect(audioContext.destination);
      analyzer.disconnect();

      expect(analyzer.channelCount).to.equal(2);
      expect(analyzer.channelCountMode).to.equal('explicit');
    });
  });

  describe('AudioNode compatibility', () => {
    it('should behave like a standard AudioNode', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);

      // Should have AudioNode-like properties
      expect(analyzer.context).to.exist;
      expect(analyzer.numberOfInputs).to.exist;
      expect(analyzer.numberOfOutputs).to.exist;
      expect(analyzer.channelCount).to.exist;
      expect(analyzer.channelCountMode).to.exist;
      expect(analyzer.channelInterpretation).to.exist;

      // Should have AudioNode-like methods
      expect(analyzer.connect).to.be.a('function');
      expect(analyzer.disconnect).to.be.a('function');
    });

    it('should be usable interchangeably with other AudioNodes', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);
      const gainNode = audioContext.createGain();

      // Should connect in both directions
      expect(() => {
        gainNode.connect(analyzer.node);
        analyzer.connect(gainNode);
      }).to.not.throw();

      gainNode.disconnect();
      analyzer.disconnect();
    });
  });

  describe('property consistency', () => {
    it('should maintain property sync with underlying node', async () => {
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);

      // Verify initial sync
      expect(analyzer.channelCount).to.equal(analyzer.node.channelCount);
      expect(analyzer.channelCountMode).to.equal(analyzer.node.channelCountMode);
      expect(analyzer.channelInterpretation).to.equal(analyzer.node.channelInterpretation);

      // Change multiple properties
      analyzer.channelCount = 2;
      analyzer.channelCountMode = 'explicit';
      analyzer.channelInterpretation = 'discrete';

      // Verify sync maintained
      expect(analyzer.channelCount).to.equal(analyzer.node.channelCount);
      expect(analyzer.channelCountMode).to.equal(analyzer.node.channelCountMode);
      expect(analyzer.channelInterpretation).to.equal(analyzer.node.channelInterpretation);
    });
  });
});
