
// TTT// interface AudioWorkletProcessor {
//   readonly port: MessagePort;
//   process(
//     inputs: Float32Array[][],
//     outputs: Float32Array[][],
//     parameters: Record<string, Float32Array>
//   ): boolean;
// }

// // TEST
// // declare let audioWorkletProcessor: {
// //   prototype: AudioWorkletProcessor;
// //   new (options?: AudioWorkletNodeOptions): AudioWorkletProcessor;
// // };

// declare function registerProcessor(
//   name: string,
//   processorCtor: (new (
//     options?: AudioWorkletNodeOptions
//   ) => AudioWorkletProcessor) & {
//     parameterDescriptors?: AudioParamDescriptor[];
//   }
// ): boolean;

class AnalyzerProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][]): boolean {
    const source = inputs[0];
    console.log('source', source);
    return true;
  }
}

registerProcessor('white-noise-processor', AnalyzerProcessor);
