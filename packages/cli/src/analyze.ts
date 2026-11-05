/// <reference types="node" />

import {Worker} from 'node:worker_threads';
import type {EngineName, OfflineResult, TempoRange} from 'realtime-bpm-analyzer/node';
import type {DecodedAudio} from './decode';

// The library's analyzeChannelData is synchronous inside: on the thread that calls it, nothing
// else runs until it returns, about a minute for the longest file the decoded limit lets
// through. On a worker the caller's thread stays free, so an abort can end it at any point.

export type AnalysisRequest = DecodedAudio & {
  readonly tempoRange: TempoRange | undefined;
  readonly engine: EngineName | undefined;
};

export type AnalysisReply = {readonly ok: true; readonly reading: OfflineResult} | {readonly ok: false; readonly error: string};

// Built next to the bundle that imports this file (dist/cli.mjs, dist/api.mjs)
const workerUrl = new URL('analyze-worker.mjs', import.meta.url);

// The worker starts from a line of code that imports its file, not from the file itself. A worker
// inherits the host's Node flags, and a host run with `node --input-type=module -e` passes on
// --input-type, which Node refuses for a worker started from a file: every analysis failed.
// Filtering the flags is no way out, because Node checks flags it is given and refuses the
// per-process ones (--v8-pool-size, --stack-trace-limit, ...) it lets a worker inherit. Code
// is valid input for --input-type of either kind, and import() reads ESM from both. A failed
// import is thrown again as an exception: a rejection alone ends the worker quietly, with no
// cause, when the host runs with --unhandled-rejections=none or =warn.
const workerCode = `import(${JSON.stringify(workerUrl.href)}).catch(error => { process.nextTick(() => { throw error; }); })`;

/**
 * Runs the library's analysis on a worker thread. The samples are moved to the worker, not
 * copied, so the decoded audio is unusable here afterwards.
 * @param request Decoded audio, tempo range and engine
 * @param signal Ends the analysis: the worker is terminated and the promise rejects, with the reason as cause
 * @returns The reading, or null when no beat was found
 * @throws {Error} The library's error, or the abort
 */
export async function analyzeOnWorker(request: AnalysisRequest, signal: AbortSignal | undefined): Promise<OfflineResult> {
  signal?.throwIfAborted();
  const worker = new Worker(workerCode, {eval: true, workerData: request, transferList: [request.channelData.buffer]});
  let onAbort = () => {};
  try {
    const reply = await new Promise<AnalysisReply>((resolve, reject) => {
      onAbort = () => {
        reject(new Error('The analysis was aborted.', {cause: signal?.reason}));
      };

      signal?.addEventListener('abort', onAbort, {once: true});
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.once('exit', code => {
        reject(new Error(`The analysis stopped before it finished (exit code ${code}).`));
      });
    });
    if (!reply.ok) {
      throw new Error(reply.error);
    }

    return reply.reading;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    await worker.terminate();
  }
}
