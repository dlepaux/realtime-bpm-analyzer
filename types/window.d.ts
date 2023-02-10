export {};

declare global {
  interface Window { // eslint-disable-line @typescript-eslint/consistent-type-definitions
    audioContext: AudioContext | undefined;
  }
}
