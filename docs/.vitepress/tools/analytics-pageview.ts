// When an in-site navigation is a page view (RBA-154): when the path changes, and only then.
// GA4's own "page changes based on browser history events" also counted a query written into
// the address (the tools put the tempo there as `?bpm=`), so each tempo set on a tool page was a
// second page view. The site sends its own page views from the router instead, and that GA4
// setting is off. Pure and import-free so node --test runs it.

/**
 * A function to call after every route change: it calls `send` once per new path. The first
 * call is the landing page, whose page view gtag's config already sent, so it only sets the
 * baseline. It is taken from the router and not from the address at load time, because the
 * router's first load rewrites some addresses (`/tap-tempo.html` becomes `/tap-tempo`).
 */
export function pageViewTracker(send: (path: string) => void): (path: string) => void {
  let last: string | null = null
  return (path) => {
    if (path === last) return
    const landing = last === null
    last = path
    if (!landing) send(path)
  }
}
