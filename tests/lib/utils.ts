import {expect} from 'chai';
import * as utils from '../../src/core/utils';
import {readChannelDataToChunk} from '../utils';

describe('Utils - Unit tests', () => {
  it('should test threshold value with stop call', async () => {
    const object = {
      foo: 0,
    };

    await utils.descendingOverThresholds(async threshold => {
      // We add an entry to object
      object.foo = threshold;
      // Stop the loop at first iteration
      return true;
    });

    // Check if object have only ONE entry
    expect(JSON.stringify(object)).to.be.equal('{"foo":0.8999999999999999}');
  });

  it('should test threshold value with boolean', async () => {
    const object = {
      foo: 0,
    };

    await utils.descendingOverThresholds(async threshold => {
      // We add an entry to object
      object.foo = threshold;
      // Stop the loop at first iteration
      return true;
    });

    expect(JSON.stringify(object)).to.be.equal('{"foo":0.8999999999999999}');
  });

  it('should test threshold without minThreshold', async () => {
    const object: Record<string, number> = {
      0.4: 0, // eslint-disable-line @typescript-eslint/naming-convention
    };

    await utils.descendingOverThresholds(async threshold => {
      // We add an entry to object
      object[threshold] = threshold;
      return false;
    });
  });

  it('should create the model with the default value', done => {
    const object = utils.generateValidPeaksModel();
    expect(JSON.stringify(Object.values(object)[0])).to.be.equal('[]');
    done();
  });

  it('should create the model with the default value', done => {
    const object = utils.generateNextIndexPeaksModel();
    expect(JSON.stringify(Object.values(object)[0])).to.be.equal('0');
    done();
  });

  it('should use the chunk aggregator', async () => {
    const audioContext = new AudioContext();
    const aggregate = utils.chunckAggregator();
    const bufferSize = 1024;
    const channelData = await readChannelDataToChunk(audioContext, bufferSize);

    for (const chunk of channelData) {
      const {isBufferFull, buffer} = aggregate(chunk);
      if (isBufferFull) {
        expect(buffer.length).to.equal(4096);
      }
    }
  });
});
