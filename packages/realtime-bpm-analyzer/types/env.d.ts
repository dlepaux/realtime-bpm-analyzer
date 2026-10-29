export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {  
      processors: Record<string, string>;
    }
  }
}
