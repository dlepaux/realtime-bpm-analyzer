import {data as channelDataJson} from './fixtures/bass-test-lowpassed-channel-data';

export function readChannelData() {
    const channelData = new Float32Array(channelDataJson);
    return channelData;
}

export function readChannelDataToChunk(bufferSize: number): Float32Array[] {
    const chunks: Float32Array[] = [];

    let currentChunk: number[] = [];
    for (const value of channelDataJson) {
        currentChunk.push(value);

        if (currentChunk.length === bufferSize) {
            chunks.push(new Float32Array(currentChunk));
            currentChunk = [];
        }
    }

    return chunks;
}

export function askUserGesture(done: (audioContest: AudioContext) => void): void {
    const button = window.document.createElement('button');
    button.innerHTML = 'Please click the button to proceed tests';

    function onClick() {
      button.removeEventListener('click', onClick);
      const audioContext = new AudioContext();
      button.innerHTML = 'Processing...';

      setTimeout(()=> {
        button.remove();
        done(audioContext);
      }, 200);
    }

    button.addEventListener('click', onClick);

    window.document.body.appendChild(button);
}
