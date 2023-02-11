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
    for (const value of channelDataRaw) {
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
    button.innerHTML = 'Process test !';

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

    // setTimeout(()=> {
    //     // Create the click event
    //     const clickEvent = new MouseEvent("click", {
    //         bubbles: true,
    //         cancelable: true,
    //     });

    //     // Dispatch the event on the button
    //     button.dispatchEvent(clickEvent);
    // }, 100);
}
