// The last line of defence for the lane rule "analytics never send URLs"
// (RBA-35). Events are built from enumerated values, but a free-text param
// such as an error message can still quote an address, so track() runs every
// event through this. Pure and import-free so `npm test` runs it with node --test.

export type EventParams = Record<string, string | number | boolean>

export const REDACTED = '[redacted]'

// A scheme (https://, blob:, data:…), a `www.` host, or a dotted host followed by a path.
const URL_SHAPED = /[a-z][a-z\d+.-]*:\/\/|\b(blob|data|spotify):|\bwww\.|\b[a-z\d-]+(\.[a-z\d-]+)+\/\S/i

export function isUrlShaped(value: string): boolean {
  return URL_SHAPED.test(value)
}

/** The params with every URL-shaped string value replaced by `[redacted]`. */
export function scrubEventParams(params: EventParams): EventParams {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) =>
      [key, typeof value === 'string' && isUrlShaped(value) ? REDACTED : value]),
  )
}
