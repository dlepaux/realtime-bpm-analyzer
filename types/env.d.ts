export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv { // eslint-disable-line @typescript-eslint/consistent-type-definitions
      processors: Record<string, string>;
    }
  }
}
