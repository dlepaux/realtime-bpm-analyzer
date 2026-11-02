/// <reference types="node" />

import {Worker} from 'node:worker_threads';
import type {Detector, Tempo, TempoRange} from 'realtime-bpm-analyzer/node';
import type {DecodedAudio} from './decode';

// The library's analyzeChannelData is synchronous inside: on the thread that calls it, nothing
// else runs until it returns, about a minute for the longest file the decoded limit lets
// through. On a worker the caller's thread stays free, so an abort can end it at any point.

export type AnalysisRequest = DecodedAudio & {
  readonly tempoRange: TempoRange | undefined;
  readonly detector: Detector | undefined;
};

export type AnalysisReply = {readonly ok: true; readonly candidates: Tempo[]} | {readonly ok: false; readonly error: string};

// Built next to the bundle that imports this file (dist/cli.mjs, dist/api.mjs)
const workerUrl = new URL('analyze-worker.mjs', import.meta.url);

/**
 * Runs the library's analysis on a worker thread. The samples are moved to the worker, not
 * copied, so the decoded audio is unusable here afterwards.
 * @param request Decoded audio, tempo range and detector
 * @param signal Ends the analysis: the worker is terminated and the promise rejects, with the reason as cause
 * @returns The candidates, best first
 * @throws {Error} The library's error, or the abort
 */
export async function analyzeOnWorker(request: AnalysisRequest, signal: AbortSignal | undefined): Promise<Tempo[]> {
  signal?.throwIfAborted();
  const worker = new Worker(workerUrl, {workerData: request, transferList: [request.channelData.buffer]});
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

    return reply.candidates;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    await worker.terminate();
  }
}
