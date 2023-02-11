/// <reference types="node" />
import {promises} from 'node:fs';

const data: Array<{path: string; title: string; description: string}> = [
  {
    path: 'index.html',
    title: 'Realtime BPM Analyzer Documentation',
    description: 'Realtime BPM Analyzer provides efficient detection of BPM, in realtime and from files',
  },
  {
    path: 'modules.html',
    title: 'Realtime BPM Analyzer Modules',
    description: 'Components of Realtime BPM Analyzer',
  },
  {
    path: 'classes/RealTimeBpmAnalyzer.html',
    title: 'Class RealTimeBpmAnalyzer',
    description: 'This Class is used by the Realtime BPM Processor',
  },
  {
    path: 'functions/analyzeFullBuffer.html',
    title: 'Function analyzeFullBuffer',
    description: 'Get the BPM of your files in a snap!',
  },
  {
    path: 'functions/createRealTimeBpmProcessor.html',
    title: 'AudioWorklet RealTimeBpmProcessor',
    description: 'Create an audio worklet and compute BPM in realtime from a stream or a microphone',
  },
  {
    path: 'types/AggregateData.html',
    title: 'Type AggregateData',
    description: 'RealTimeBpmAnalyzer AggregateData Type',
  },
  {
    path: 'types/AsyncConfigurationEvent.html',
    title: 'Type AsyncConfigurationEvent',
    description: 'RealTimeBpmAnalyzer AsyncConfigurationEvent Type',
  },
  {
    path: 'types/AsyncConfigurationEventData.html',
    title: 'Type AsyncConfigurationEventData',
    description: 'RealTimeBpmAnalyzer AsyncConfigurationEventData Type',
  },
  {
    path: 'types/BpmCandidates.html',
    title: 'Type BpmCandidates',
    description: 'RealTimeBpmAnalyzer BpmCandidates Type',
  },
  {
    path: 'types/BpmEvent.html',
    title: 'Type BpmEvent',
    description: 'RealTimeBpmAnalyzer BpmEvent Type',
  },
  {
    path: 'types/BpmEventData.html',
    title: 'Type BpmEventData',
    description: 'RealTimeBpmAnalyzer BpmEventData Type',
  },
  {
    path: 'types/Group.html',
    title: 'Type Group',
    description: 'RealTimeBpmAnalyzer Group Type',
  },
  {
    path: 'types/Interval.html',
    title: 'Type Interval',
    description: 'RealTimeBpmAnalyzer Interval Type',
  },
  {
    path: 'types/NextIndexPeaks.html',
    title: 'Type NextIndexPeaks',
    description: 'RealTimeBpmAnalyzer NextIndexPeaks Type',
  },
  {
    path: 'types/OnThresholdFunction.html',
    title: 'Type OnThresholdFunction',
    description: 'RealTimeBpmAnalyzer OnThresholdFunction Type',
  },
  {
    path: 'types/Peaks.html',
    title: 'Type Peaks',
    description: 'RealTimeBpmAnalyzer Peaks Type',
  },
  {
    path: 'types/PeaksAndThreshold.html',
    title: 'Type PeaksAndThreshold',
    description: 'RealTimeBpmAnalyzer PeaksAndThreshold Type',
  },
  {
    path: 'types/RealTimeBpmAnalyzerOptions.html',
    title: 'Type RealTimeBpmAnalyzerOptions',
    description: 'RealTimeBpmAnalyzer RealTimeBpmAnalyzerOptions Type',
  },
  {
    path: 'types/RealTimeBpmAnalyzerParameters.html',
    title: 'Type RealTimeBpmAnalyzerParameters',
    description: 'RealTimeBpmAnalyzer RealTimeBpmAnalyzerParameters Type',
  },
  {
    path: 'types/Tempo.html',
    title: 'Type Tempo',
    description: 'RealTimeBpmAnalyzer Tempo Type',
  },
  {
    path: 'types/Threshold.html',
    title: 'Type Threshold',
    description: 'RealTimeBpmAnalyzer Threshold Type',
  },
  {
    path: 'types/ValidPeaks.html',
    title: 'Type ValidPeaks',
    description: 'RealTimeBpmAnalyzer ValidPeaks Type',
  },
];

async function main(): Promise<void> {
  for (const meta of data) {
    let html = await promises.readFile(`docs/${meta.path}`, 'utf8');
    html = html.replace(/<title>(.*?)<\/title>/, `<title>${meta.title}</title>`);
    html = html.replace(
      '<meta name="description" content="Documentation for Realtime BPM Analyzer">',
      `<meta name="description" content="${meta.description}">`,
    );
    await promises.writeFile(`docs/${meta.path}`, html, 'utf8');
  }

  console.log('DONE');
}

main().catch((error: unknown) => {
  console.error(error);
});
