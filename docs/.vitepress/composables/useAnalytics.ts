// Thin analytics wrapper — pushes events into `window.dataLayer` for GTM to consume.
// GTM forwards to GA4 (and any other configured tags) via the container dashboard.
// SSR-safe — no-ops when `window` is undefined.

type EventParams = Record<string, string | number | boolean>

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
  | 'github_star_clicked'

export function useAnalytics() {
  function track(event: BpmAnalyticsEvent, params: EventParams = {}): void {
    if (typeof window === 'undefined') return

    window.dataLayer = window.dataLayer || []
    window.dataLayer.push({ event, ...params })

    if (import.meta.env.DEV) {
      console.debug('[analytics]', event, params)
    }
  }

  return { track }
}
