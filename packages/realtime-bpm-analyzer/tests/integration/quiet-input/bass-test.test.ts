import {probeQuietInput} from '../../lib/quiet-input-probe';
import {sampleRate, type Source} from '../../fixtures/quiet-input';

probeQuietInput('bass-test.wav', async (): Promise<Source> => {
  const response = await fetch('/tests/fixtures/bass-test.wav');
  const decoded = await new OfflineAudioContext(1, 1, sampleRate).decodeAudioData(await response.arrayBuffer());
  const channels = Array.from({length: decoded.numberOfChannels}, (_, c) => decoded.getChannelData(c));

  return {name: 'bass-test.wav', truth: null, channels};
});
