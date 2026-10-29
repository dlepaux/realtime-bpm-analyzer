// Thin analytics wrapper — pushes events into `window.dataLayer` for GTM to consume.
// GTM forwards to GA4 (and any other configured tags) via the container dashboard.
// SSR-safe — no-ops when `window` is undefined.

import { scrubEventParams, type EventParams } from '../tools/analytics-params'

declare global {
  interface Window {
    dataLayer?: unknown[]
  }
}

export type BpmAnalyticsEvent =
  | 'bpm_tab_change'
  | 'bpm_file_selected'
  | 'bpm_file_result'
  | 'bpm_file_error'
  | 'bpm_file_restart'
  | 'bpm_mic_clicked'
  | 'bpm_mic_stable'
  | 'bpm_mic_error'
  | 'bpm_mic_stopped'
  | 'bpm_stream_clicked'
  | 'bpm_stream_stable'
  | 'bpm_stream_error'
  | 'bpm_stream_stopped'
  | 'bpm_stream_muted'
  | 'bpm_stream_unmuted'
  | 'bpm_link_detected'
  | 'bpm_tab_capture_started'
  | 'bpm_tab_capture_failed'
  | 'bpm_tap_measured'
  | 'bpm_delay_copied'
  | 'bpm_metronome_started'
  | 'bpm_tool_link_clicked'
  | 'github_star_clicked'

export function useAnalytics() {
  function track(event: BpmAnalyticsEvent, params: EventParams = {}): void {
    if (typeof window === 'undefined') return

    // Never a URL in an event (RBA-35), even one quoted inside an error message.
    const safe = scrubEventParams(params)
    window.dataLayer = window.dataLayer || []
    window.dataLayer.push({ event, ...safe })

    if (import.meta.env.DEV) {
      console.debug('[analytics]', event, safe)
    }
  }

  return { track }
}
