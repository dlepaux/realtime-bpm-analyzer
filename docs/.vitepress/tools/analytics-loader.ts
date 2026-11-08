// How Google Analytics reaches the page (RBA-154): gtag.js directly, no tag manager, on the
// production host only. The loader is an inline script the config puts in every page's head,
// built here so a test can run it against any hostname.
//
// Internal traffic: on a device of the site's owner, run once in the browser console on the
// production site
//     localStorage.setItem('rba:internal', '1')
// and its visits carry traffic_type=internal, which the GA4 internal traffic filter excludes.
// localStorage.removeItem('rba:internal') turns it off.
//
// Page views: gtag's config sends the first, and GA4's enhanced measurement ("page changes based
// on browser history events") sends one per in-site navigation. Nothing here sends page_view, so
// there is exactly one per page (checked by scripts/analytics-contract.e2e.ts).
// Pure and import-light so node --test runs it.

import { PRODUCTION_HOST } from './site-url.ts'

export const GA_MEASUREMENT_ID = 'G-S911G9WQTM'
export const GTAG_SRC = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`
export const INTERNAL_FLAG_KEY = 'rba:internal'

/** The inline loader: does nothing unless the page is on `host`. */
export function gaLoaderScript(measurementId: string = GA_MEASUREMENT_ID, host: string = PRODUCTION_HOST): string {
  const id = JSON.stringify(measurementId)
  return [
    '(function(){',
    `if(location.hostname!==${JSON.stringify(host)})return;`,
    // gtag.js reads its queue from window.dataLayer, and wants each call's `arguments` as is.
    'window.dataLayer=window.dataLayer||[];',
    'function gtag(){window.dataLayer.push(arguments);}',
    'window.gtag=gtag;',
    "gtag('js',new Date());",
    'var config={};',
    `try{if(localStorage.getItem(${JSON.stringify(INTERNAL_FLAG_KEY)})==='1')config.traffic_type='internal';}catch(e){}`,
    `gtag('config',${id},config);`,
    "var s=document.createElement('script');s.async=true;",
    `s.src=${JSON.stringify(`https://www.googletagmanager.com/gtag/js?id=${measurementId}`)};`,
    'document.head.appendChild(s);',
    '})();',
  ].join('')
}
