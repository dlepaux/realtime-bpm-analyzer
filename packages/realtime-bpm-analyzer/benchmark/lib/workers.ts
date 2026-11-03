import {cpus} from 'node:os';

/**
 * @returns Workers to start. A container sees the host's cores whatever it was given, so a job sets RBA_JOB_WORKERS
 */
export function workerCount(): number {
  const asked = Number(process.env.RBA_JOB_WORKERS);

  return asked > 0 ? Math.floor(asked) : Math.max(1, cpus().length - 2);
}
