import {data as channelDataJson} from './fixtures/bass-test-lowpassed-channel-data';

export async function readChannelData() {
    const values: number[] = Object.values(channelDataJson);
    const channelData = new Float32Array(values);
    return channelData;
}
