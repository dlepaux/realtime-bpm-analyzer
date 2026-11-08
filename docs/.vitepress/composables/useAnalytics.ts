// The site's one way to send an analytics event (RBA-154). Typed from the catalogue in
// tools/analytics-events.ts, gated at run time by tools/analytics-gate.ts, then handed to gtag.js,
// which tools/analytics-loader.ts loads on the production host only. Everywhere else the event is
// still checked, and logged in dev, but nothing is sent. SSR-safe: a no-op without `window`.

import type { EventName, TrackArgs } from '../tools/analytics-events'
import { nextTick } from 'vue'
import { gateEvent, isEventName } from '../tools/analytics-gate'
import { pageViewTracker } from '../tools/analytics-pageview'
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
    // Loud but out of band: thrown from a microtask, so it shows as an uncaught error in dev
    // without unwinding the caller (many calls sit inside a try whose catch would swallow it,
    // or would skip a teardown). The tool behaves the same with or without a contract slip.
    const error = gated.problems.length ? new AnalyticsContractError(gated.problems.join('\n')) : null
    if (error) queueMicrotask(() => { throw error })
    console.debug('[analytics]', event, gated.params)
  }
  if (!isEventName(event) || !canSend()) return
  window.gtag?.('event', event, gated.params)
}

function canSend(): boolean {
  return window.location.hostname === PRODUCTION_HOST && typeof window.gtag === 'function'
}

// The first page view is gtag's config's; the router reports the rest, one per new path (see
// tools/analytics-pageview.ts for why GA4's own history tracking is off). Each hit is shaped like
// the config's: no hash in the address, and the page left as its referrer, which GA4's history
// tracking used to set and gtag would otherwise fill with the landing page's outside referrer.
const pageLocation = () => window.location.origin + window.location.pathname + window.location.search
let previousLocation = ''
const onRoute = typeof window === 'undefined'
  ? () => {}
  : pageViewTracker(() => {
    if (!canSend()) return
    window.gtag?.('event', 'page_view', { page_location: pageLocation(), page_referrer: previousLocation, page_title: document.title })
  })

/** The router's onAfterRouteChange: a page view once the new page, and its title, are in place. */
export async function trackRouteChange(): Promise<void> {
  await nextTick()
  onRoute(window.location.pathname)
  previousLocation = pageLocation()
}

export function useAnalytics() {
  return { track }
}
