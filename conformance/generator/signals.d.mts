// Types for signals.mjs, so the library's TypeScript tests can build the conformance inputs (RBA-221's oracle test)

export type Signal = {
  id: string;
  description: string;
  sampleRate: number;
  build: () => Float64Array;
  optionSets?: string[];
  nonFinite?: Array<{index: number; value: string}>;
  perturbation?: number;
};

export function noiseSource(seed: number): () => number;
export function toPcm16(mix: Float64Array): Int16Array;
export const edgeThreshold: number;
export const signals: readonly Signal[];
