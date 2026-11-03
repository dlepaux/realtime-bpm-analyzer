// What a TypeScript caller could write against 5.4.0's published types. tests/node/published-compat.test.mjs
// compiles it against the built declarations, so it fails the day one of these stops compiling.
import {RealTimeBpmAnalyzer} from 'realtime-bpm-analyzer';

const fiveFourOptions = {
  continuousAnalysis: false,
  stabilizationTime: 20_000,
  muteTimeInIndexes: 10_000,
  debug: false,
  tempoRange: {min: 90, max: 180},
};

export function replaceOptions(analyzer: RealTimeBpmAnalyzer): void {
  analyzer.options = fiveFourOptions;
}

export const typedOptions: RealTimeBpmAnalyzer['options'] = fiveFourOptions;

export class OverridesOptions extends RealTimeBpmAnalyzer {
  override options = {...fiveFourOptions};
}

// 5.4.0's class had no private members, so anything with its public shape could stand in for it
export function standIn(publicShape: Pick<RealTimeBpmAnalyzer, keyof RealTimeBpmAnalyzer>): RealTimeBpmAnalyzer {
  return publicShape;
}
