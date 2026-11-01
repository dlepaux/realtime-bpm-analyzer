// The steps that open audio resources before the tool has anywhere to keep them. A running
// AudioContext holds the output device until it is closed or its tab goes away, and its
// variable going out of scope does not close it, so a step that fails must release what it
// opened (RBA-93). Types are the slice used here, so tests run in Node without Web Audio.

type Closable = { close: () => Promise<void> }
type Decoding<B> = Closable & { decodeAudioData: (data: ArrayBuffer) => Promise<B> }
type Resumable = Closable & { resume: () => Promise<void> }

const closeQuietly = (context: Closable) => {
  context.close().catch((e: unknown) => console.debug('[audio-setup] context close:', e))
}

/** Decodes with a context used for nothing else. The buffer outlives the context. */
export async function decodeAndClose<B>(context: Decoding<B>, data: ArrayBuffer): Promise<B> {
  try {
    return await context.decodeAudioData(data)
  } finally {
    closeQuietly(context)
  }
}

/**
 * Starts a context and its analyzer for an input the caller already opened. On failure the
 * context is closed and `releaseInput` called, then the error goes on to the caller, which
 * has nothing left to clean up. On success the caller owns all of it.
 */
export async function openAnalysis<C extends Resumable, A>(
  createContext: () => C,
  createAnalyzer: (context: C) => Promise<A>,
  releaseInput: () => void,
): Promise<{ context: C; analyzer: A }> {
  let context: C | null = null
  try {
    context = createContext()
    await context.resume()
    return { context, analyzer: await createAnalyzer(context) }
  } catch (error) {
    releaseInput()
    if (context) closeQuietly(context)
    throw error
  }
}
