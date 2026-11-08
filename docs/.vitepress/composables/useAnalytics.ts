// The site's one way to send an analytics event (RBA-154). Typed from the catalogue in
// tools/analytics-events.ts, gated at run time by tools/analytics-gate.ts, then handed to gtag.js,
// which tools/analytics-loader.ts loads on the production host only. Everywhere else the event is
// still checked, and logged in dev, but nothing is sent. SSR-safe: a no-op without `window`.

import type { EventName, TrackArgs } from '../tools/analytics-events'
import { gateEvent, isEventName } from '../tools/analytics-gate'
import { PRODUCTION_HOST } from '../tools/site-url'

type Gtag = (command: 'event', name: string, params: Record<string, string | number | boolean>) => void

declare global {
  interface Window {
    /** Defined by the analytics loader, on the production host only. */
    gtag?: Gtag
  }
}

/** A track() call that breaks the catalogue's contract. Thrown in dev only. */
export class AnalyticsContractError extends Error {
  override name = 'AnalyticsContractError'
}

export function track<E extends EventName>(event: E, ...[params]: TrackArgs<E>): void {
  if (typeof window === 'undefined') return

  const gated = gateEvent(event, params ?? {})
  if (import.meta.env.DEV) {
    if (gated.problems.length) throw new AnalyticsContractError(gated.problems.join('\n'))
    console.debug('[analytics]', event, gated.params)
  }
  if (!isEventName(event) || window.location.hostname !== PRODUCTION_HOST || typeof window.gtag !== 'function') return
  window.gtag('event', event, gated.params)
}

export function useAnalytics() {
  return { track }
}
