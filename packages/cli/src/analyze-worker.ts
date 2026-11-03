/// <reference types="node" />

import {parentPort, workerData} from 'node:worker_threads';
import {analyzeChannelData} from 'realtime-bpm-analyzer/node';
import {errorMessage} from './errors';
import type {AnalysisReply, AnalysisRequest} from './analyze';

// The library's analysis is synchronous and can run for a minute on a long file. It runs on
// this thread so the caller's thread stays free to hear an abort and to stop it.

const {channelData, sampleRate, tempoRange, detector} = workerData as AnalysisRequest;

/**
 * @returns The analysis, or the library's reason it refused the audio
 */
async function analyse(): Promise<AnalysisReply> {
  try {
    return {ok: true, reading: await analyzeChannelData(channelData, sampleRate, {tempoRange, engine: detector})};
  } catch (error: unknown) {
    return {ok: false, error: errorMessage(error)};
  }
}

parentPort?.postMessage(await analyse());
