import {data as channelDataJson} from './fixtures/bass-test-lowpassed-channel-data';

export function readChannelData() {
    const values: number[] = Object.values(channelDataJson);
    const channelData = new Float32Array(values);
    return channelData;
}

export function readChannelDataToChunk(bufferSize: number): Float32Array[] {
    const chunks: Float32Array[] = [];
    const channelDataRaw: number[] = Object.values(channelDataJson);

    let currentChunk: number[] = [];
    for (const [index, value] of channelDataRaw.entries()) {
        currentChunk.push(value);

        // Normally each 4095 modulo 0
        if (index % bufferSize - 1 === 0) {
            chunks.push(new Float32Array(currentChunk));
            currentChunk = [];
        }
    }
    
    return chunks;
}

export function askUserGesture(done: Mocha.Done): void {
    const button = window.document.createElement('button');
    button.innerHTML = 'Process test !';

    function onClick() {
      window.audioContext = new AudioContext();
      button.innerHTML = 'Processing...';

      setTimeout(()=> {
        button.removeEventListener('click', onClick);
        button.remove();
        done();
      }, 200);
    }

    button.addEventListener('click', onClick);

    window.document.body.appendChild(button);
}
