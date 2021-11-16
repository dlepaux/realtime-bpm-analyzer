export const routeExemples = {
  'audio-node': 'Audio Node',
  'user-media': 'User Media',
  stream: 'Stream',
};

export const publicPath = process.env.NODE_ENV === 'production' ? '/realtime-bpm-analyzer/' : '/';

export const exampleMusicFile = '{publicPath}$media/new_order-blue_monday.mp3';

export const installationCommand = 'npm install realtime-bpm-analyzer';

export const usageStepOne = '<audio src="{publicPath}$media/new_order-blue_monday.mp3" id="music"></audio>';

export const usageStepTwo = `// Create new instance of AudioContext
const audioContext = new AudioContext();
// Set the source with the HTML Audio Node
const source = audioContext.createMediaElementSource(document.getElementById('music'));
// Set the scriptProcessorNode to get PCM data in real time
const scriptProcessorNode = audioContext.createScriptProcessor(4096, 1, 1);
// Connect everythings together
scriptProcessorNode.connect(audioContext.destination);
source.connect(scriptProcessorNode);
source.connect(audioContext.destination);
`;

export const usageStepThree = `import RealTimeBPMAnalyzer from 'realtime-bpm-analyzer';

const realTimeBPMAnalyzer = new RealTimeBPMAnalyzer({
  scriptNode: {
    bufferSize: 4096
  },
  pushTime: 2000,
  pushCallback: (err, bpm) => {
    console.log('bpm', bpm);
  }
});

// Attach realTime function to audioprocess event.inputBuffer (AudioBuffer)
scriptProcessorNode.addEventListener('audioprocess', event => {
  realTimeBPMAnalyzer.analyze(event);
});
`;
