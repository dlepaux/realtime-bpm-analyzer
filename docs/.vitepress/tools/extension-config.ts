// Settings for the extension pages (RBA-38) that depend on services which do not
// exist yet. Each block they drive renders only once its value is set, so the site
// never shows a form that posts nowhere or a link that goes nowhere.

/** Where the welcome page's email opt-in posts: a listmonk public subscription form. */
export type LeadCapture = {
  /** The form endpoint, `https://<listmonk host>/subscription/form`. */
  readonly formUrl: string
  /** The UUID of the listmonk list the address joins. */
  readonly listUuid: string
}

// Null until the self-hosted listmonk is deployed. RBA-38's DECISION of 2026-10-30
// rules that lead capture uses listmonk on David's own infrastructure, with double
// opt-in, an explicit consent line and a privacy-policy entry, never a newsletter
// SaaS. Setting this also means adding the email list to website-privacy.md.
export const LEAD_CAPTURE: LeadCapture | null = null

// Null until the extension has a store listing. Setting it to the listing's URL is
// the one switch for the site's promotion (RBA-58): it builds the /extension/ page and
// turns on its nav link, the home hero action and section, the links from the tools and the goodbye
// page's reinstall link. See tools/extension-promo.ts.
export const EXTENSION_STORE_URL: string | null = null
