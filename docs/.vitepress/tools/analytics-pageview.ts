// When an in-site navigation is a page view (RBA-154): when the path changes, and only then.
// GA4's own "page changes based on browser history events" also counted a query written into
// the address (the tools put the tempo there as `?bpm=`), so each tempo set on a tool page was a
// second page view. The site sends its own page views from the router instead, and that GA4
// setting is off. Pure and import-free so node --test runs it.

/** A function to call after every route change: it calls `send` once per new path. */
export function pageViewTracker(firstPath: string, send: (path: string) => void): (path: string) => void {
  let last = firstPath
  return (path) => {
    if (path === last) return
    last = path
    send(path)
  }
}
