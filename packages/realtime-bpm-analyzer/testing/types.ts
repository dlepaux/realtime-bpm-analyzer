import type {Tempo} from '../src/index';

export type Manifest = Record<string, number>;

export type Closure<T> = () => Promise<T>;

export type AudioFile = {
  filename: string;
  bpm: number;
  tempos: Tempo[];
};
