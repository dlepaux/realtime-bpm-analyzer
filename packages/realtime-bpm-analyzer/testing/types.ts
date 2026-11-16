import type {Candidate} from '../src/index';

export type Manifest = Record<string, number>;

export type Closure<T> = () => Promise<T>;

export type AudioFile = {
  filename: string;
  bpm: number;
  tempos: readonly Candidate[];
};
