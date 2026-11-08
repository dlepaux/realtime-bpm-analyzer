// The site's one public address. The config builds canonicals and the sitemap from it, and
// analytics loads only on its host (RBA-154), so a preview or local copy never reports.
// Pure and import-free so `npm test` runs it with node --test.

export const SITE_URL = 'https://www.realtime-bpm-analyzer.com'

/** The only hostname Google Analytics loads on. */
export const PRODUCTION_HOST = new URL(SITE_URL).hostname
