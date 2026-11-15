// In docs dev each embed loads its example from that example's own dev server, which
// `npm run docs:dev` does not start (RBA-231). The embed checks the server first, and names the
// command to run instead of showing a blank frame. Production serves the built examples from the
// site itself and never probes. The ports are the ones each example's vite config falls back to,
// and docs/scripts/dev-examples.ts starts the servers from this same list.

/** Each example's dev server port: example `NN` on port `30NN`. */
export const EXAMPLE_DEV_PORTS: Readonly<Record<string, number>> = {
  '01-vanilla-basic': 3001,
  '02-vanilla-streaming': 3002,
  '03-vanilla-microphone': 3003,
  '04-react-basic': 3004,
  '05-react-streaming': 3005,
  '06-react-microphone': 3006,
  '07-vue-basic': 3007,
  '08-vue-streaming': 3008,
  '09-vue-microphone': 3009,
}

/** The root script that starts every example's dev server, as the embed shows it. */
export const EXAMPLES_DEV_COMMAND = 'npm run examples:dev'

/** The embed's wait between two checks while the dev server is down: it doubles up to the cap. */
export const DEV_SERVER_RETRY_MS = { first: 3000, max: 30000 } as const

/** The next wait, after `previous` (none before the first retry). */
export function nextRetryMs(previous?: number): number {
  return previous === undefined ? DEV_SERVER_RETRY_MS.first : Math.min(previous * 2, DEV_SERVER_RETRY_MS.max)
}

export type DevServerStatus = 'checking' | 'up' | 'down'

/** The slice of `fetch` the probe uses, so tests run without a network. */
export type ProbeFetch = (url: string, init?: RequestInit) => Promise<unknown>

/**
 * Whether a Vite dev server answers at `origin`. The request is `no-cors`: the example is on
 * another origin and sends no CORS headers, so the response is opaque, but it resolves when the
 * server answers and rejects when nothing listens on the port. It asks for Vite's client script
 * rather than the page: Opaque Response Blocking may turn a no-cors HTML response into a network
 * error, which would read as a server that is down, and it never blocks JavaScript.
 */
export async function probeDevServer(origin: string, fetchFn: ProbeFetch): Promise<DevServerStatus> {
  try {
    await fetchFn(new URL('/@vite/client', origin).href, { mode: 'no-cors', cache: 'no-store' })
    return 'up'
  } catch {
    return 'down'
  }
}
