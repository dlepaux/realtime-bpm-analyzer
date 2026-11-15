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

/** How long the embed waits between two checks while the dev server is down. */
export const DEV_SERVER_RETRY_MS = 3000

export type DevServerStatus = 'checking' | 'up' | 'down'

/** The slice of `fetch` the probe uses, so tests run without a network. */
export type ProbeFetch = (url: string, init?: RequestInit) => Promise<unknown>

/**
 * Whether a dev server answers at `url`. The request is `no-cors`: the example is on another
 * origin and sends no CORS headers, so the response is opaque, but it resolves when anything
 * answers and rejects when nothing listens on the port.
 */
export async function probeDevServer(url: string, fetchFn: ProbeFetch): Promise<DevServerStatus> {
  try {
    await fetchFn(url, { mode: 'no-cors', cache: 'no-store' })
    return 'up'
  } catch {
    return 'down'
  }
}
